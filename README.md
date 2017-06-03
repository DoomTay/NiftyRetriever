# NiftyRetriever
This tool, first developed on September 22, 2016, was made for scraping a given website for links to the now defunct webhosting service Nifty in light of [the service's closure on November 10, 2016](http://homepage.nifty.com/information/2016/01/). As the tool has served its purpose, it is no longer being maintained, and has been put on display for historical purposes.

# Files
## index.js
The main tool. Given a website, it would crawl that website for outgoing links to URLs containing the term "nifty". It is also cpable of traversing site crawls from [Wayback Machine](http://web.archive.org) or outgoing links that obscure the link destination, as well as SmarTrans links. Collected links are then compiled into a list and then outputted to a file, which is then fed to [ArchiveBot](https://github.com/ArchiveTeam/ArchiveBot) so that these URLs are archived. This tool makes use of an older version of jsdom 9.8.0.

In the event of a problem such as an unusual response or an unparseable URL, the script will immediately shut down, outputting all Nifty links collected so far as well as a file representing its scraping progress. The file can be read so that progress can be resumed from that point.

## pgscraper.js
Scrapes user profiles from the now defunct community [portalgraphics](http://wayback.archive.org/web/20160726140351/http://www.portalgraphics.net/pg/)

## yomiscraper.js
Used for scraping search results in websites powered by [Yomi-Search](https://web.archive.org/web/20050711020446/http://yomi.pekori.to/). This is only effective on live websites. Usually, a site can contain helpful links outside of search results, so this was used in conjunction with the main script.

## listfilter.js
This takes a given list file and all other lists that have been used for the archival of Nifty. It then removes all links that are already in at least one of the other lists, and then outputs a reduced list.

## memberstohomepage.js
Nifty used to host websites under the member.nifty.ne.jp domain. Sometimes, the user will have moved their website to one of the three "homepage" subdomains.

This script takes a given list, detects instances of member.nifty.ne.jp URLs, and attempts to find the "new" URL under one of the three "homepage" subdomains through trial and error. If a working URL is found, the original URL is replaced with the working URL. A new file is created with any working URLs substituted in.
