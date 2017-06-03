var fs = require('fs');
var request = require('request');

var filename = process.argv[2];

var filteredURLs = fs.readFileSync(filename).toString().split("\r\n");
var noExtension = filename.substring(0,filename.indexOf("."));

if(!process.argv[2])
{
	console.log("Please include a file to filter");
	process.exit(9);
}

function getList(URL)
{
	return new Promise(function(resolve)
	{
		console.log("Getting",URL);
		request(URL, function (err, response, body) {
			if(err != null)
			{
				if(err.code == "ETIMEDOUT")
				{
					console.log(this.uri.href,"timed out. Retrying in 10 seconds...");
					setTimeout(function() {crawlURL(URL,callback);}, 10000);
				}
				else throw new Error(err + "\nStopping at " + URL);
			}
			else if (!err && response.statusCode == 200)
			{
				console.log("Got",URL);
				resolve(body.split("\n"));
			}
			else throw new Error(response.statusCode + " " + response.statusMessage);
		});
	})
}

Promise.all([getList("https://gist.githubusercontent.com/DoomTay/4a7f1d1986a3654f17f1a77d997e50ab/raw/d51f589589158ffd0e756569b8f3aa5bba66c485/misssplinks.txt"),
getList("https://gist.githubusercontent.com/anonymous/c8212a801bf5f9b278949da7f56c1a5a/raw/1d74e36b61142f50a8f669e793da952f03ef629d/shuushuuniftylinks.txt"),
getList("https://raw.githubusercontent.com/ArchiveTeam/nifty-discovery/master/urls/archiveis.txt"),
getList("https://sanqui.rustedlogic.net/etc/archiveteam/nifty_wikimedia_sites_fix.txt"),
getList("https://raw.githubusercontent.com/ArchiveTeam/nifty-discovery/master/urls/hatena.txt"),
getList("https://gist.githubusercontent.com/anonymous/b68c88613640338b1400c3fc1902abbb/raw/bbc9dddf4b25c5cec635b7eab6e87f35035798b8/pgnifty.txt"),
getList("https://gist.githubusercontent.com/anonymous/9b87552976537c9eb41b87e0b96d918a/raw/223ea50f650737f6cf0676a9376a75097f205f40/gistfile1.txt"),
getList("https://gist.githubusercontent.com/anonymous/51bba20313be7ae5ff2512f37ca824b6/raw/92adf6000927a9d4e7b47423ab969d515df274e0/nextlist.txt"),
getList("https://gist.githubusercontent.com/anonymous/87eb521b49a1b85d1a1e723215cc090c/raw/f77a02e500b95a86cd5557b5d2d632d907b14c96/almostfinal.txt"),
getList("https://gist.githubusercontent.com/anonymous/e2e7adbfb94b5691eb41171f345e83bb/raw/f8f89243b67ef5a755ad7d3b20158e38f160dee6/secondfiltered.txt"),
getList("https://gist.githubusercontent.com/anonymous/5ee0b44d6c7737e4a2f3a0054e02351a/raw/fc1427ede3eef024228a4098ef3626e03af29423/panic.txt"),
getList("https://gist.githubusercontent.com/anonymous/72bf2f29183e9656cd834ac83b8651f2/raw/2cefe5e804e2a4e20508642c26e42116ea8fafef/panic2.txt"),
getList("https://gist.githubusercontent.com/anonymous/0b4b1b6d48fc14e627b5f6bd2b76813c/raw/fa4dafd22cd9e4d0791a52bc26959a3a1c7c8e0f/panic3.txt")]).then(lists =>
{
	var bigList = [].concat.apply([], lists);
	console.log("Filtering list");
	filteredURLs = filteredURLs.filter(item => bigList.indexOf(item) == -1);
	fs.writeFileSync(noExtension + "-filtered.txt", filteredURLs.join("\r\n"));
	console.log("Done");
});