var fs = require('fs');
var jsdom = require("jsdom");
process.binding('http_parser').HTTPParser = require('http-parser-js').HTTPParser;
var request = require('request');
var Promise = require('promise/lib/es6-extensions');
var url = require('url');
var parse = require('parse-link-header');
var iconv = require('iconv-lite');
var readline = require('readline');
var util = require('util');
var sniffHTMLEncoding = require("html-encoding-sniffer");

var visitedLinks = [];
var collectedLinks = [];
var isInWayback = url.parse(process.argv[2]).hostname.includes("archive.org");
var downLinks = [];

if(!process.argv[2])
{
	console.log("Please include an URL to crawl");
	process.exit(9);
}

var baseDomain = process.argv[2].substring(process.argv[2].lastIndexOf("/http") + 1,process.argv[2].lastIndexOf("/") + 1);

if(isInWayback)
{
	var timestamp = /web\/(\d{1,14})/.exec(process.argv[2])[1];
}

function addToQueue(URL)
{
	var originalURL = URL.substring(URL.lastIndexOf("/http") + 1);
	visitedLinks.push({url:originalURL,status:"waiting"})
}

console.log = function(d)
{
	var args = Array.from(arguments);
	process.stdout.clearLine();
	readline.cursorTo(process.stdout, 0);
	this._stdout.write(util.format.apply(this, arguments) + '\n');
	process.stdout.write(visitedLinks.length.toString() + " pages discovered, " + getQueue() + " to go");
};

function getLinks()
{
	var attempts = 10;
	
	if(allLinksCrawled()) return;
	
	var targetedURL = visitedLinks.find(entry => entry.status == "waiting");
			
	if(targetedURL == undefined)
	{
		setTimeout(getLinks, Math.random() * 1000);
		return;
	}
			
	var originalURL = targetedURL.url;
	
	var URL;
	if(isInWayback)
	{
		if(originalURL.includes("mode=link")) URL = "http://web.archive.org/web/1/" + originalURL;
		else URL = "http://web.archive.org/web/" + timestamp + "/" + originalURL;
	}
	else if(/www[1-3]\.to\//.test(originalURL)) URL = "http://web.archive.org/web/1id_/" + originalURL;
	else URL = originalURL;
		
	function wrapItUp()
	{
		targetedURL.status = "done";
		if(allLinksCrawled())
		{
			console.log(baseDomain,"complete");
			fs.writeFileSync("collected/queuedump-" + url.parse(baseDomain).hostname + ".txt", "", "utf8");
		}
		else getLinks();
	}
	
	if(URL.toLowerCase().includes("?"))
	{
		var deconstructed = url.parse(URL,true).query;
		var possibleURL = deconstructed["URL"] || deconstructed["url"] || deconstructed["hp"] || deconstructed["HP"] || deconstructed["msg"] || deconstructed["MSG"] || deconstructed["title"] || deconstructed["down"] || deconstructed["u"] || deconstructed["lin"] || deconstructed["rd"] || deconstructed["f"] || deconstructed["target_uri"];
		if(possibleURL && typeof(possibleURL) == "string" && possibleURL.startsWith("http"))
		{
			console.log("Recovered URL:",possibleURL,"from",URL);
			if(possibleURL.includes("nifty")) collectedLinks.push(possibleURL);
			else if(/www[1-3]\.to\//.test(possibleURL)) addToQueue(possibleURL);
			wrapItUp();
			return;
		}
		else
		{
			for(var prop in deconstructed)
			{
				if(typeof(deconstructed[prop]) == "string" && deconstructed[prop].startsWith("http") && deconstructed[prop] != "http:style" && deconstructed[prop] != possibleURL && prop != "kt" && prop != "ad" && prop != "location" && prop != "ref" && prop != "word")
				{
					throw new Error("Unidentified URL property in" + URL + ": " + prop)
				}
			}
		}
	}
	
	function crawlURL(URL,callback)
	{
		var originalURL = URL.substring(URL.lastIndexOf("/http") + 1);
		
		function tryPreviousCrawls(response)
		{
			if(response.headers["link"] && isInWayback && response.headers["x-archive-playback"] == "1")
			{
				var memento = parse(response.headers["link"]);
				if(memento.prev)
				{
					console.log(response.request.uri.href,"returned",response.statusCode,"Attemping previous timestamp...");
					return crawlURL(memento.prev.url,callback);
				}
				else return callback(null,response);
			}
			else return callback(null,response);
		}
		
		setTimeout(function() {
			request({ url: URL, followRedirect: false, encoding: null, agent:false }, function (err, response, body) {
				if(err != null)
				{
					if(err.code == "ETIMEDOUT")
					{
						console.log("[" + getTime() + "]", this.uri.href, "timed out. Retrying in 10 seconds...");
						setTimeout(function() { crawlURL(URL,callback); }, 10000);
					}
					else if(err.code == "ECONNRESET")
					{
						console.log("[" + getTime() + "]", "Connection reset for", this.uri.href, " Reinitializing...");
						setTimeout(function() { crawlURL(URL,callback); }, 2000);
					}
					else if(err.code == "ECONNREFUSED")
					{
						console.log("[" + getTime() + "]", "Connection refused for", this.uri.href, "Retrying in 10 seconds...");
						setTimeout(function() { crawlURL(URL,callback); }, 10000);
					}
					else if(err.code == "ENOTFOUND")
					{						
						if(attempts > 0)
						{
							console.log(this.uri.href, "not found. Retrying", attempts, "more times in 10 seconds...");
							attempts--;
							setTimeout(function() { crawlURL(URL,callback); }, 10000);
						}
						else
						{
							console.log("[" + getTime() + "]", this.uri.href, "not responding. Discarding...");
							downLinks.push(this.uri.href);
							return callback(err);
						}
					}
					else if(err.code == "HPE_INVALID_HEADER_TOKEN")
					{
						console.log("[" + getTime() + "]", this.uri.href, "has bad headers. Discarding...");
						return callback(err);
					}
					else
					{
						console.error("Unknown error:");
						console.error("From", URL, "to", this.uri.href, "\nShutting down...");
						return callback(err);
					};
				}
				else
				{
					response.body = iconv.decode(response.body, getEncoding(response));
					if(response.headers.location)
					{
						var fullRedirect = url.resolve(this.uri.href, response.headers.location);
						if(fullRedirect.substring(fullRedirect.lastIndexOf("/http") + 1) == originalURL) return crawlURL(fullRedirect,callback);
						
						console.log("[" + getTime() + "]", decodeRecursive(this.uri.href), "returned", response.statusCode, response.statusMessage, "Following", fullRedirect, "...");
						
						if((sameSubdomainAndPath(fullRedirect) && !alreadyVisited(fullRedirect)) || /www[1-3]\.to\//.test(fullRedirect))
						{
							addToQueue(fullRedirect);
							wrapItUp();
							//return crawlURL(fullRedirect,callback);
						}
						else if(fullRedirect.includes("nifty") && !fullRedirect.includes("jpsnet-gm"))
						{
							collectedLinks.push(fullRedirect);
							console.log("Collected", fullRedirect);
							wrapItUp();
						}
						else
						{
							console.log("[" + getTime() + "]", "Nothing of interest for", decodeRecursive(fullRedirect), "Discarding...");
							wrapItUp();
						}
					}
					else if(response.statusCode >= 500)
					{
						if(response.statusCode >= 503 && !isInWayback)
						{
							console.log(this.uri.href, "returned", response.statusCode, response.statusMessage, "Retrying...");
							setTimeout(function() { crawlURL(URL,callback); }, 10000);
						}
						else if(!isInWayback)
						{
							if(attempts > 0)
							{
								console.log(this.uri.href, "returned", response.statusCode, response.statusMessage, "Retrying", attempts, "more times in 10 seconds...");
								attempts--;
								setTimeout(function() { crawlURL(URL,callback); }, 10000);
							}
							else
							{
								console.log("[" + getTime() + "]", this.uri.href, "not responding. Discarding...");
								downLinks.push(this.uri.href);
								return callback(null,response);
							}
						}
						else if(isInWayback && response.headers["x-archive-playback"] == "0")
						{
							console.log(this.uri.href, "returned", response.statusCode, response.statusMessage, "Retrying in 10 seconds...");
							setTimeout(function() { crawlURL(URL,callback); }, 10000);
						}
						else
						{
							console.log(this.uri.href, "returned", response.statusCode, response.statusMessage);
							tryPreviousCrawls(response);
							
						}
					}
					else if(response.body.trim() == "")
					{
						//This only seems to happen in Wayback Machine. Sometimes the page really is blank, and other times it happens when Wayback Machine is being trampled.
						console.log("[" + getTime() + "]", this.uri.href, "turned up blank.");
						if(response.headers["content-length"] == 0)
						{
							if(response.headers["link"])
							{
								var memento = parse(response.headers["link"]);
								if(memento.prev)
								{
									console.log("Attemping previous timestamp...");
									return crawlURL(memento.prev.url,callback);
								}
								else
								{
									console.log("Discarding...");
									return callback(null,response);
								}
							}
							else
							{
								console.log("Discarding...");
								return callback(null,response);
							}
						}
						else if(response.headers["content-length"] > 0)
						{
							console.log("Retrying in 10 seconds...");
							setTimeout(function() { crawlURL(URL,callback); }, 10000);
						}
						else
						{
							console.log("Headers:");
							console.log(response.statusCode.toString(), response.statusMessage, "\n", response.headers);
							throw new Error(this.uri.href + " turned up blank");
						}
					}
					else if(response.statusCode == 404 || response.statusCode == 403 || response.body.includes("\u3010\u30A8\u30E9\u30FC\u3011"))
					{
						tryPreviousCrawls(response);
					}
					else if(response.statusCode == 400)
					{
						if(response.headers["x-archive-playback"] == "1") return callback(null,response);
						else return callback(new Error(URL + ": " + response.statusCode + " " + response.statusMessage));
					}
					else
					{
						return callback(null,response);
					}
				}
			});
		}, Math.random() * (350 - 275) + 275);
	}
	
	targetedURL.status = "loading";
	
	crawlURL(URL, (err,response) =>
	{
		if(err)
		{
			if(err.code == "ENOTFOUND")
			{
				wrapItUp();
			}
			else if(err.code == "HPE_INVALID_HEADER_TOKEN")
			{
				wrapItUp();
			}
			else
			{
				throw err;
			}
		}
		
		else 
		{
			console.log("[" + getTime() + "]",response.request.uri.href,"returned",response.statusCode,response.statusMessage);
			
			if(response.statusCode == 200)
			{
				jsdom.env({html:response.body,url:response.request.uri.href, done:function (err, window)
				{
					if(!err)
					{
						var links = window.document.links;
												
						var frames = window.document.getElementsByTagName("frame");
						
						for(var f = 0; f < frames.length; f++)
						{
							if(frames[f].src.endsWith(originalURL)) continue;
							if(!frames[f].src) continue;
							processURL(frames[f].src);
						}
						
						var forumIgs = [
							/mode=tan&/,
							/sort=\d+/,
							/imgon=1/,
							/&kmode=tag/,
							/&kmode=name/,
							/mode=mini/,
							/logkan=T/,
							/mode=respasf/,
							/bi=1/,
							/yomi.cgi?mylinkact=add&mylinkid=.+?/,
							/regist_ys.cgi?mode=enter&id=.+?/
						];
						
						for(var l = 0; l < links.length; l++)
						{
							if(window.document.getElementById("wm-ipp") && window.document.getElementById("wm-ipp").contains(links[l])) continue;
							if(links[l].href == "http://???" || encodeURI(links[l].href).includes("http://%") || links[l].href.includes("dlsite") || links[l].href.includes("support.nifty") || links[l].href.includes("http://#")) continue;
							if(forumIgs.find(pattern => pattern.test(links[l].href))) continue;
							if(links[l].href.includes("&orderby=")) continue;
							if(links[l].href.includes("midudu@")) continue;
							if(links[l].href.includes("amp%3Bamp%3B")) continue;
							if(links[l].href.includes("mode=edit")) continue;
							if(links[l].href.startsWith("http")) processURL(links[l].href);
						}
						
						wrapItUp();
					}
					else throw err;
					
					function processURL(path)
					{
						var targetedLink = path.includes("#") ? path.substring(0,path.lastIndexOf("#")) : path;
						targetedLink = targetedLink.replace("http//","http://");
						targetedLink = targetedLink.replace("http;//","http://");
						if((sameSubdomainAndPath(path) || (path.includes("?") && isInDomain(path)) || (/\/www[1-3]\.to\//.test(path) && !path.endsWith(".to/"))) && !alreadyVisited(targetedLink.substring(targetedLink.lastIndexOf("/http") + 1)) && !path.endsWith(".jpg") && !path.endsWith(".zip") && !path.endsWith(".psd") && !path.endsWith(".diff") && !path.endsWith(".txt") && !path.endsWith(".png") && !path.endsWith(".gif") && !path.endsWith(".lzh") && !path.endsWith(".pdf"))
						{
							if(targetedLink.includes("p=") || targetedLink.includes("kt[]="))
							{
								var originalURL = targetedLink.substring(targetedLink.lastIndexOf("/http") + 1);
								visitedLinks.push({url:originalURL,status:"waiting"})
							}
							else addToQueue(targetedLink);
							//addToQueue(targetedLink);
						}
						else if(path.includes("nifty") && collectedLinks.indexOf(targetedLink.substring(targetedLink.lastIndexOf("http"))) == -1 && !path.toLowerCase().includes("?") && !path.endsWith(".jpg") && !path.endsWith(".gif") && !path.includes(baseDomain) && !path.includes("search.nifty")) collectedLinks.push(targetedLink.substring(targetedLink.lastIndexOf("http")));
					}
				}});
			}
			else if(response.statusCode == 400 || response.statusCode == 401 || response.statusCode == 403 || response.statusCode == 404 || response.statusCode == 500)
			{
				wrapItUp();
			}
			else
			{
				throw new Error(`${response.request.uri.href}\n${response.statusCode} ${response.statusMessage}`);
				emergencyDump();
			}
		}
	});
}

function getEncoding(response)
{
	if(response.headers["content-type"] && response.headers["content-type"].includes("charset"))
	{
		var contentType = response.headers["content-type"];
		return contentType.substring(contentType.indexOf("charset=") + 8);
	}
	else
	{
		return sniffHTMLEncoding(response.body);
	}
}

function decodeRecursive(URL)
{
	while(URL.includes("%25")) URL = decodeURI(URL);
	
	return URL;
}

function getQueue()
{	
	return visitedLinks.filter(entry => (entry.status == "loading" || entry.status == "waiting")).length;
}

function allLinksCrawled()
{
	return getQueue() == 0;
}

function getTime()
{
	var date = new Date();
	
	return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

function sameSubdomainAndPath(URL)
{
	//console.log(URL);
	URL = URL.replace("http://http:","http://");
	URL = URL.replace("https//","https://");
	URL = URL.replace("http :","http:");
	if(!URL.includes("http://http.")) URL = URL.replace("http://http","http");
	URL = URL.replace("http/","http://");
	URL = URL.replace(/http\S\/\//,"http://");
	if(URL.endsWith("http://") || URL.endsWith("http/")) return false;
	var parsedBase = baseDomain.replace("www.","");
	var parsedURL = "";
	//console.log(URL);
	if(URL.includes("archive.org")) parsedURL = url.parse(URL.substring(URL.indexOf("/http") + 1));
	else parsedURL = url.parse(URL);
	var URLDomain = parsedURL.protocol + "//" + parsedURL.hostname.replace("www.","") + parsedURL.pathname.substring(0,parsedURL.pathname.lastIndexOf("/") + 1);
		
	return parsedBase == URLDomain || URLDomain.includes(parsedBase);
}

function isInDomain(URL)
{
	URL = URL.replace("http://http//","http://");
	if(URL.endsWith("http://")) return false;
	var parsedBase = url.parse(baseDomain.replace("www.",""));
	
	var parsedURL = url.parse(URL.substring(URL.indexOf("/http") + 1).replace("www.",""));
	if(URL.includes("www.") && baseDomain.includes("www.")) return parsedURL.hostname == parsedBase.hostname;
	else
	{
		var URLParts = parsedURL.hostname.split(".");
		var baseParts = parsedBase.hostname.split(".");
		return URLParts.some(v => baseParts.indexOf(v) > -1 && v != "com" && v != "net" && v != "ne" && v != "co" && v != "jp" && v != "cool" && v != "org" && v != "infoseek" && v != "sakura" && v != "jhnet" && v != "hammer" && v != "peko" && v != "to" && v != "jpn" && v != "or" && v != "xrea" && v != "cside" && v != "yuu" && v != "cc" && v != "fc2" && v != "ocn" && v != "moo"&& v != "tv");
	}
}

function emergencyDump()
{
	console.log("Dumping queue");
	var listToString = "";
	
	for(var i = 0; i < visitedLinks.length; i++)
	{
		visitedLinks[i].url
		listToString += visitedLinks[i].url + "\t";
		if(visitedLinks[i].status == "done") listToString += "done";
		else listToString += "waiting";
		listToString += "\r\n";
	}
	
	listToString = listToString.substring(0,listToString.length - 2);
	var out = fs.writeFileSync("collected/queuedump-" + url.parse(baseDomain).hostname + ".txt", listToString, "utf8");
}

fs.readFile("collected/queuedump-" + url.parse(baseDomain).hostname + ".txt", "utf8", function (err,data) {
	if (err) {
		console.log("Queue dump not found. Beginning from root")
		addToQueue(process.argv[2]);
		begin();
	}
	
	else
	{
		var queueToText = data.split("\r\n");
				
		if(queueToText.length == 0 || queueToText[0] == "")
		{
			addToQueue(process.argv[2]);
			begin();
		}
		else
		{
			for(var i = 0; i < queueToText.length; i++)
			{
				var thing = queueToText[i].split("\t");
				visitedLinks.push({url:thing[0],status:thing[1]});
			}
						
			begin();
		}
	}
});

function alreadyVisited(path)
{
	return visitedLinks.some(entry => entry.url == path);
}

function begin() {
	(function myLoop (i) {
		setTimeout(function () {
			getLinks();
			if (--i) myLoop(i);
		}, Math.random() * (350 - 275) + 275)
	})(5);
}

function zeroPad(str,len) {
	return "0".repeat(len - str.toString().length) + str.toString();
}

process.on ('exit', function (code) {
	var date = new Date();
	if(code != 0) emergencyDump();
	/*console.log("Consolidating list...");
	collectedLinks = collectedLinks.filter((link,i,array) => array.lastIndexOf(link) == i);*/
	console.log(collectedLinks.length.toString(),"Nifty links found");
	if(collectedLinks.length > 0)
	{
		console.log("Writing to output");
		
		var now = date.getFullYear() +
		zeroPad(date.getMonth()+1,2) +
		zeroPad(date.getDate()+1,2) +
		zeroPad(date.getHours(),2) +
		zeroPad(date.getMinutes(),2) +
		zeroPad(date.getSeconds(),2);
		
		var out = fs.writeFileSync("collected/" + url.parse(baseDomain).hostname + "-" + now + ".txt", collectedLinks.join("\r\n"));
		console.log("Done");
	}
	if(downLinks.length > 0) var failedstuff = fs.writeFileSync("collected/errorlinks-" + url.parse(baseDomain).hostname + ".txt", downLinks.join("\r\n"));
	console.log("Exiting with code",code);
	process.exit(code);
})
process.on('SIGINT', function()
{
	console.log("Crawling aborted");
	process.exit(1);
})
process.on('uncaughtException', function (err) {
  console.error(err.stack);
  process.exit(1);
})