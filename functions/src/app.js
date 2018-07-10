var express = require('express');
var request = require('request-promise');
var functions = require('firebase-functions')
var app = express()

// firebase functions:config:set steam.apikey="$YOUR_STEAM_API_KEY"
var conf = functions.config().steam
var STEAM_KEY = conf ? conf.apikey : process.env.STEAM_API_KEY

if (typeof STEAM_KEY === 'undefined' || STEAM_KEY === null || STEAM_KEY.length === 0) {
    return console.log("\nPlease pass the STEAM_KEY as a parameter. If you need to get a key, please go to http://steamcommunity.com/dev/apikey\n" +
        'e.g. node express.js XXXXXXXXXXXXXXXXXX\n')
}

var API = {};
API.getVanityUrl = function(username) {
    // response.friendslist.friends (array)
    return request({
        url: 'http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=' + STEAM_KEY + '&vanityurl=' + username,
        json: true
    })
}
API.getFriends = function(steamId) {
    // response.friendslist.friends (array)
    return request({
        url: 'http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=' + STEAM_KEY + '&steamid=' + steamId + '&relationship=friend',
        json: true
    })
}
API.getFriendSummaries = function(steamIds) {
    // response.response.players (array)
    return request({
        url: 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=' + STEAM_KEY + '&steamids=' + steamIds.join(','),
        json: true
    })
}
API.getGames = function(steamId) {
    // response.games (array)
    return request({
        url: 'http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=' + STEAM_KEY + '&steamid=' + steamId + '&include_appinfo=1&include_played_free_games=1',
        json: true
    });
}
API.sendError = function(res) {
    return function(err) {
        res.status(400).send(err);
    }
}

/* ---- Routes ---- */

app.route('/')
    .get((req, res) => {
        res.type('text/html')
        res.status(200)
        res.write('<b>Enter Steam login name...</b><hr/>')
        res.write('<p><b style="color:red">N.B. Your <a href="https://steamcommunity.com/my/edit/settings">steam profile</a> must be set to "public".</b></p>')
        res.write('<p>')
        res.write('<form action="/friends" method="get">')
        res.write('<label>Steam login name:</label>&nbsp;')
        res.write('<input name="username" type="text" size="40" placeholder="Enter your Steam login name..." autofocus/>')
        res.write('</p>')
        res.write('<p><input type="submit" value="Next - choose friends" /></p>')
        res.write('</form>')
        res.end()
    })

app.route('/friends')
    .get((req, res) => {
        var username = req.query.username
        API.getVanityUrl(username).then(vanityRes => {
            var mySteamId = vanityRes.response.steamid
            if (mySteamId) {
                API.getFriends(mySteamId).then(getFriendsRes => {
                    var friendIds = getFriendsRes.friendslist.friends.map(f => f.steamid)
                    friendIds.unshift(mySteamId)
                    // get names of friends...
                    var promises = []
                    promises.push(API.getFriendSummaries(friendIds))
                    Promise.all(promises).then(responses => {
                        var friends = responses[0].response.players
                        friends = friends.sort((a, b) => a.personaname.localeCompare(b.personaname))
                        res.type('text/html')
                        res.status(200)
                        res.write('<b>Choose friends to search...</b><hr/>')
                        res.write('<form action="/friends/games" method="get">')
                        res.write('<p>')
                        res.write('<table border=1 cellspacing=1 cellpadding=4>')
                        res.write('<tr><th>' + 'Select,Avatar,SteamId,Nickname,Realname,ProfileUrl (Username)'.split(',').join('</th><th>') + '</th></tr>')
                        friends.forEach(f => {
                            res.write('<tr>')
                            res.write('<td><input type="checkbox" name="friendIds" value="' + f.steamid + '" ' + (f.steamid == mySteamId ? 'checked' : '') + '/>')
                            res.write('<td>' + ['<img src="' + f.avatarmedium + '"/>', f.steamid, f.personaname, f.realname, '<a href="' + f.profileurl + '">' + f.profileurl + '</a>'].join('</td><td>') + '</td>')
                            res.write('</tr>')
                        })
                        res.write('</table>')
                        res.write('</p>')
                        res.write('<p><input type="submit" value="Next - see shared games" /></p>')
                        res.write('</form>')
                        res.end()
                    },
                    error => res.status(400).send(error))
                })
            } else {
                res.status(400).send('Could not find SteamId from username.')
            }
        },
        error => res.status(400).send(error))
    })
    

app.route('/friends/games')
    .get((req, res) => {
        var friendIds = req.query.friendIds
        var promises = []
        promises.push(API.getFriendSummaries(friendIds))
        friendIds.forEach(id => promises.push(API.getGames(id)))

        Promise.all(promises).then(responses => {
            // map of friends...
            var friendsBySteamId = responses[0].response.players.reduce(function(map, p) {
                map[p.steamid] = p;
                return map;
            }, {});
            var friends = friendIds.map(id => friendsBySteamId[id])
            // map of games...
            var gamesByAppId = {};
            var gameOwnersByAppId = {};
            for (var i = 1; i < responses.length; i++) {
                var games = responses[i].response.games;
                if (typeof games === 'undefined') {
                    console.error('games was undefined at index ' + i + ' of ' + responses.length, JSON.stringify(responses[i], null, 4));
                }
                else {
                    var steamid = friendIds[i - 1];
                    games.forEach(function(g) {
                        gamesByAppId[g.appid] = g;
                        var owners = gameOwnersByAppId[g.appid];
                        if (typeof owners === 'undefined') {
                            owners = gameOwnersByAppId[g.appid] = [];
                        }
                        owners.push(steamid);
                    });
                }
            }

            res.type('text/html')
            res.status(200)
            res.write('<b>Shared games (unsorted)...</b><hr/>')
            res.write('<table border=1 cellspacing=1 cellpadding=4>');

            // avatars
            res.write('<tr><th></th><th></th><th>Avatar:</th><th>')
            res.write(friends.map(f => '<img src="' + f.avatarmedium + '"></img>').join('</th><th>'));
            res.write('</th></tr>');

            // nicknames
            res.write('<tr><th></th><th></th><th>Nickname:</th><th>')
            res.write(friends.map(f => '<a href="' + f.profileurl + '">' + f.personaname + '</a>').join('</th><th>'))
            res.write('</th></tr>');

            // realnames
            res.write('<tr><th></th><th></th><th>Realname:</th><th>')
            res.write(friends.map(f => '<a href="' + f.profileurl + '">' + f.realname + '</a>').join('</th><th>'))
            res.write('</th></tr>');

            // games
            Object.keys(gamesByAppId).forEach(function(appid) {
                var game = gamesByAppId[appid];
                var owners = gameOwnersByAppId[appid];
                res.write('<tr>')
                res.write('<th><img title="' + game.name + '" src="http://media.steampowered.com/steamcommunity/public/images/apps/' + appid + '/' + game.img_logo_url + '.jpg"></img></th>');
                res.write('<th>' + game.name + '</th>');
                res.write('<th>' + friendIds.filter(id => owners.indexOf(id) !== -1).length + '</th>');
                res.write('<th>');
                // and whether the user is an owner...
                res.write(friendIds.map(id => owners.indexOf(id) !== -1 ? 'TRUE' : '').join('</th><th>'));
                res.write('</th></tr>');
            });
            res.end('</table>');

        },
        error => res.status(400).send(error))
    })

module.exports = { app }
