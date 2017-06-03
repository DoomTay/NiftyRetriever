var Promise = require('promise/lib/es6-extensions');
var fs = require('fs');
var request = require('request');

var filename = process.argv[2];

var filteredURLs = fs.readFileSync(filename).toString().split("\r\n");

var noExtension = filename.substring(0,filename.indexOf("."));

var mark = 0;

if(!process.argv[2])
{
	console.log("Please include an URL to crawl");
	process.exit(9);
}

function crawlURL(URL)
{
	return new Promise(function(resolve)
	{
		request.head(URL, function (err, response) {
			if(err != null)
			{
				if(err.code == "ETIMEDOUT")
				{
					console.log(this.uri.href,"timed out. Retrying in 10 seconds...");
					setTimeout(function() {resolve(crawlURL(URL));}, 10000);
				}
				else
				{
					console.log("Unknown error:\n",err,"\nStopping at",URL);
					process.exit(1);
				}
			}
			else if (!err)
			{
				if(response.statusCode >= 500)
				{
					console.log(this.uri.href,"returned",response.statusCode,response.statusMessage,"Retrying",attempts, "more times in 10 seconds...");
					setTimeout(function() {resolve(crawlURL(URL))}, 10000);
				}
				else
				{
					console.log(URL,response.statusCode,response.statusMessage);
					resolve(response);
				}
			}
		})
	})
}

for( var i = 0; i < 5; i++ ) {
    tryURL();
}

function tryURL()
{
	var URL = filteredURLs[++mark];
	
	var currentID = mark;
	
	if(mark >= filteredURLs.length) return;
		
	if(!URL.includes("member.nifty.ne.jp"))
	{
		tryURL();
		return;
	}
		
	var path = URL.substring(URL.indexOf(".ne.jp/") + 7);
	
	if(mark < filteredURLs.length) tryURL();
	
	Promise.all([crawlURL("http://homepage1.nifty.com/" + path),crawlURL("http://homepage2.nifty.com/" + path),crawlURL("http://homepage3.nifty.com/" + path)]).then(results =>
	{
		for(var r = 0; r < results.length; r++)
		{
			if(results[r].statusCode == 200)
			{
				filteredURLs.splice(currentID,1,results[r].request.uri.href);
				break;
			}
		}
		tryURL();
	})
}

process.on ('exit', function (code) {
	console.log("Filtering list");
	fs.writeFileSync(noExtension + "-converted.txt", filteredURLs.join("\r\n"));
	console.log("Done");
})

process.on('uncaughtException', function (err) {
  console.trace(err);
  process.exit(1);
})