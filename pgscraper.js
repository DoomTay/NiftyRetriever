var XMLHttpRequest = require('xhr2');
var fs = require('fs');
var jsdom = require("jsdom");
var request = require('request');

var visitedLinks = {};
var collectedLinks = [];

var i = 19740;

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
					else
					{
						console.log("Unknown error:\n",err,"\nStopping at",startingNumber);
						process.exit(1);
					}
				}
				else if (!err && response.statusCode == 200)
				{
					callback(this.uri.href,body);
				}
				else if(response.statusCode > 500)
				{
					console.log(this.uri.href,"returned",response.statusCode,response.statusMessage,"Retrying in 10 seconds...");
					setTimeout(function() {crawlURL(URL,callback);}, 10000);
				}
				else
				{
					console.log("Unknown error:\n",response.statusCode,response.statusMessage,"\nStopping at",startingNumber);
					process.exit(1);
				}
			});
		}, Math.random() * (350 - 275) + 275);
	}
	
	crawlURL("http://web.archive.org/web/1/http://portalgraphics.net/pg/profile/?user_id=" + startingNumber, function processData(url,body)
	{
		jsdom.env(body, function (err, window) {
			if(body.includes("ERROR_CHEX") || body.includes("level4_db")) getLinks(++i);
			else if(window.document.querySelector(".profile-table"))
			{
				var homeURL = findHomeURL(window.document.querySelector(".profile-table"),"URL");
				if(!homeURL) homeURL = findHomeURL(window.document.querySelector(".profile-table"),"web サイト");
				if(homeURL && homeURL.includes("nifty")) collectedLinks.push(homeURL);
				
				console.log("Crawled",url);
				if(i == 21159)
				{
					console.log("Crawl complete");
				}
				else getLinks(++i);
			}
			else if(body.includes("現在、回線が込み合っております。時間をおいて再度アクセスしてください"))
			{
				crawlURL("http://web.archive.org" + window.document.querySelector(".d > td:nth-child(3) > a:nth-child(1)").href,processData);
			}
			else
			{
				console.log(url,"is missing the profile table.\nStopping at",startingNumber);
				process.exit(1);
			}
		});
	});
	
	function findHomeURL(table,phrase)
	{
		var possibleURL = Array.prototype.find.call(table.querySelectorAll("th"),th => th.textContent.includes(phrase));
		if(possibleURL) return possibleURL.nextElementSibling.textContent;
		else return null;
	}
}

getLinks(i);
(function myLoop (l) {
	getLinks(++i);
	setTimeout(function () {
		if (--l) myLoop(l);
	}, Math.random() * (350 - 275) + 275)
})(4);


process.on ('exit', function (code) {
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