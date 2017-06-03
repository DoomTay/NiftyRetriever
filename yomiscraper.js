var fs = require('fs');
var jsdom = require("jsdom");
var request = require('request');
var url = require('url');

var collectedLinks = [];

var i = 0;
var maxPage = 2;

function getLinks(startingNumber)
{
	function crawlURL(URL,callback)
	{
		setTimeout(function() {
			request(URL, function (err, response, body) {
				if(err != null)
				{
					if(err.code == "ETIMEDOUT")
					{
						console.log(this.uri.href,"timed out. Retrying in 10 seconds...");
						setTimeout(function() {crawlURL(URL,callback);}, 10000);
					}
					else if(err.code == "ENOTFOUND")
					{
						console.log(this.uri.href,"not found");
						if(i == maxPage)
						{
							console.log("Crawl complete");
						}
						else getLinks(++i);
					}
					else
					{
						console.log("Unknown error:\n",err,"\nStopping at",startingNumber);
						process.exit(1);
					}
				}
				else if (!err)
				{
					if(this.uri.href.includes(".nifty.com")) collectedLinks.push(this.uri.href);
					else if(response.statusCode == 200)
					{
						callback(this.uri.href,response);
					}
					else if(response.statusCode > 500)
					{
						console.log(this.uri.href,"returned",response.statusCode,response.statusMessage,"Retrying in 10 seconds...");
						setTimeout(function() {crawlURL(URL,callback);}, 10000);
					}
					else if(response.statusCode == 404 || response.statusCode == 403)
					{
						console.log(this.uri.href,"returned",response.statusCode,response.statusMessage);
						if(i == maxPage)
						{
							console.log("Crawl complete");
						}
						else getLinks(++i);
					}
					else
					{
						console.log("Unknown error with",this.uri.href,"\n",response.statusCode,response.statusMessage,"\nStopping at",startingNumber);
						process.exit(1);
					}
				}
			});
		}, Math.random() * (350 - 275) + 275);
	}
	
	crawlURL("http://gameofserch.com/y.cgi?page=" + startingNumber + "&mode=search&sort=time_new&word=nifty&engine=pre&search_kt=014_001-b_all&search_day=&use_str=&method=and", function processData(finalUrl,response)
	{
		jsdom.env({html:response.body,url:finalUrl,done:function (err, window) {
			var links = window.document.links;
			
			for(var l = 0; l < links.length; l++)
			{
				var urlQuery = url.parse(links[l].href,true).query["url"];
				if(urlQuery && urlQuery.includes("nifty")) collectedLinks.push(urlQuery);
				//else if(links[l].href.includes("mode=link&id=")) crawlURL(links[l].href,processData);
				else if(/page=([0-9]+)/.test(links[l].href))
				{
					if(parseInt(/page=([0-9]+)/.exec(links[l].href)[1]) > 6)
					{
						console.log("wierdness at",finalUrl);
						process.exit(1);
					}
					maxPage = Math.max(maxPage, parseInt(/page=([0-9]+)/.exec(links[l].href)[1]));
				}
			}
			console.log("Crawled",finalUrl);
			
			if(i == maxPage)
			{
				console.log("Crawl complete");
			}
			else getLinks(++i);
		}});
	});
	
	function findHomeURL(table,phrase)
	{
		var possibleURL = Array.prototype.find.call(table.querySelectorAll("th"),th => th.textContent.includes(phrase));
		if(possibleURL) return possibleURL.nextElementSibling.textContent;
		else return null;
	}
}

(function myLoop (l) {
	getLinks(++i);
	setTimeout(function () {
		if (--l) myLoop(l);
	}, Math.random() * (350 - 275) + 275)
})(4);


process.on ('exit', function (code) {
	collectedLinks = collectedLinks.filter((link,i,array) => array.lastIndexOf(link) == i);
	console.log(collectedLinks.length,"Nifty links found");
	console.log("Writing to output");
	var out = fs.writeFileSync("output.txt", collectedLinks.join("\r\n"));
	console.log("Done");
	process.exit (code);
})
process.on('SIGINT', function()
{
	console.log("Crawling aborted");
	process.exit(0);
})
process.on('uncaughtException', function (err) {
  console.log(err);
  process.exit(1);
})