<a href="https://extension.js.org" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Powered%20by%20%7C%20Extension.js-0971fe" alt="Powered by Extension.js" align="right" /></a>

# RatioYT

> Cross-browser extension that shows like/dislike ratio scores on YouTube video cards — on the home feed, search, shorts, playlists and more.

Scores come from the [Return YouTube Dislike](https://returnyoutubedislike.com) API and are cached locally in IndexedDB, so browsing stays fast and the API isn't hammered.

![screenshot](./public/screenshot.png)

## Features

- Score badges on video cards: percentage, 10-point ratio, smiley faces, or 5-star SVGs with half stars
- Optional dynamic score colouring (red → green)
- Quiet mode: filter the feed without showing badges
- Hide low-rated videos (home & search) behind a soft blur — hovering reveals them
- Adjustable minimum-score threshold
- Remote-updateable selector config, so YouTube UI changes don't need an extension update

## Commands

### dev

Run the extension in development mode. Target a browser with `--browser`:

```bash
npm run dev
npm run dev -- --browser=firefox
npm run dev -- --browser=edge
```

### build

Build for production. Convenience scripts target each browser:

```bash
npm run build           # Chrome (default)
npm run build:firefox
npm run build:edge
```

### preview

Preview the production build in the browser:

```bash
npm run preview
```

## Learn more

[Extension.js docs](https://extension.js.org).




##### DEVLOGS


Devlog #1: Initial Design and goals

Whenever I look up niches stuff on YouTube, many times low quality clickbait pops up inn the feed, I was getting annoyed so i made this extension.
The goal is to basically show some kind of % or rating at the bottom of the every tile in the yt home screen, those values will be the ratio of likes to dislikes

for this project these are the things I'm going to use
- Return YouTube dislike API (since YouTube stopped providing dislike data itself)
- Extension.js for cross browser Extensions
- Browser Storage API for caching API requests

Some extra features I would like to add would be
- A settings Popup
- hiding videos with low score
- Ability to use different rating quantifiers

This is my first time making an extension, so far I have managed to setup the initial `manifest.json` and make a basic popup

![image](https://cdn.hackclub.com/019ea6f0-1686-79ea-9d23-e745cd03c215/Screenshot%202026-06-08%20163525.png)

---

Devlog #2: Injecting Text Into YouTube UI

First things first I changed the project's name from `RatioYT` to `ThumbScore for YouTube` (I suck at naming things)

now as for the progress, I managed to inject placeholder text into youtube UI
and ngl that was more troublesome than I expected it to be.

![image](https://cdn.hackclub.com/019eaaf7-d05b-77f4-b0a6-fdf99e024f3b/Screenshot%202026-06-09%20112230.png)
(I am using a clean profile for development, so this is not what my actual YT recommendations look like ^_^ )

when I was inspecting the HTML it had so many tags and elements TWT
also the structure of videos arent consisitent throught the youtube system

there are different structers for the videos and shorts in these places
- Homepage
- Serach
- Shorts
- Playlists
- Mixes
- YT Channel Page
- Video Queues
- Playlist Queues

for now I think I managed to insert text in all these places programamtically.
But after doing this initial setup I found one major issue, There are too many videos, the users will hit API rate limits if they try to fetch video data for each of them, I can add rate limits, but then the extension wont be responsive enough.

I have a plan for this isuues, but i'll first lookup online about similar implementaions before deciding on my plan of action.

---


Devlog #3: Major Code Refactoring and Improvements

Today I worked on rewriting my code where I thought performance was being sacrificed.

I have divided the code into 3 parts
- UI Update Script
- Storage Cleanup Script
- \<planned for future part>

I'm using an IndexDB database to maintain a local copy of all the YT video ids and their scores and how long before their cache needs to be purged

now explaining what the 3 pieces do in simple terms

the UI scripts looks for YouTube DOM updates and extracts video ids and places a placeholder div where the score will be added
then the score is first looked up in the local database and if not found its looked up in the external API

The UI script pulls data from the database once on every page load and it does not bother checking if the cache is expired, that's handled by the storage background script that runs every 15 minutes and cleans the storage of old cache

I have created a robust system of caching with 3 different tiers, I plan on adding a cache sharing system between users where these tiers will come in handy

Oh and Kind of random but this little function that coverts score into a HSL colour code in a range between red and green is probably my favorite thing I did today, there were other things I did today that were more difficult to achieve for me, but this was more fun than anyone of them.

![image](https://cdn.hackclub.com/019eb189-533d-7b88-9b31-881858894016/Screenshot%202026-06-10%20115623.png)
![image](https://cdn.hackclub.com/019eb189-7def-7a59-a533-80b8ee7ce518/Screenshot%202026-06-10%20115608.png)
*[The Scores are randomly generated for now, those aren't real ratings]*

I also learned a lot of difference between browser compatibility for extension development, good thing i started with a framework otherwise I would have been screwed trying to build for both chrome and firefox

---

Devlog #4: Set Backs and Change of design

Just a short journel, I was qorking on the background cache cleaning and updating script, But I overlooked a critical point.
The IndexDB i'm using to save data is stored per origin, meaning the indexDB used by the content script is not the same as the indexDB used by the background scipt.

This has forced me to fundamentally change my approach and I'll be shifting all the code to the content scripts.

---

Devlog #5: New Sub-Project Idea

I had planned to use WEB-RTC + PeerJS to connect users of the client to share their cache with each other.
But I ran into several issues along the line.

My Biggest Issues Were

- need of a TURN/STUN server for WebRTC connection
- NAT Issues
- Dicovery Problem

Now I'll elaborate on each one of them one by one

### Issue of the STUN server

whenever you connect through WEB-RTC your public IP address is needed, for that we use a STUN server to fetch that imfo, Luckily Google provides a free public stun server which I would be using

### NAT Issues

Around 10-20 % of my users might be behind heaveliy restricted company or commercial NAT, which simply means that they dont have thier own static IPs but some random internal routing is done by the isp, there are workarounds for it but at my level they are pointless

### Discovery problem

Even if I use Peer.js's default signalling server I will have to know the exact id of the other user. which is not exactly possible with a backend.

At first I just thought of self-hosting a backend myself, cuase it had a feature to get all peers ready to connect. But its problem was that it just dumped all the peers at once, plus it would put too much pressure on the server

### My Solution

Create a lobby server, where users can post and get others ids without having to explicitally trying to hardcode an id. what it will do is just collect users who ping the server with their ids and then display those ids

no need for elaborate setup process for my future projects too, and I plan to turn it into a fulll fledged website, package and server
## Popup settings

Score format · Score colour · Quiet mode · Hide low-rated videos · Minimum score

---

