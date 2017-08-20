var express = require('express');
var http = require('http');
var request = require('request-promise');

var STEAM_KEY = process.argv[2]; // i.e. third param e.g. node express.js XXXX
var LOCAL_SERVER_PORT = 3000;

if (typeof STEAM_KEY === 'undefined' || STEAM_KEY === null || STEAM_KEY.length === 0) {
    return console.log("\nPlease pass the STEAM_KEY as a parameter. If you need to get a key, please go to http://steamcommunity.com/dev/apikey\n" +
        'e.g. node express.js XXXXXXXXXXXXXXXXXX\n')
}

var API = {};
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

var app = express()

app.route('/api/friends/:steamId')
    .get(function(req, res) {
        var steamId = req.params.steamId
        API.getFriends(steamId).then(function(response) {
            // get a list of all ids...
            var ids = [steamId]
            response.friendslist.friends.forEach(function(f) {
                ids.push(f.steamid);
            });
            // get names of friends...
            var promises = [API.getFriendSummaries(ids)];
            // get games of friends...
            ids.forEach(function(id) {
                promises.push(API.getGames(id));
            });
            Promise.all(promises).then(function(responses) {
                    // map of friends...
                    var friendsBySteamId = responses[0].response.players.reduce(function(map, p) {
                        map[p.steamid] = p;
                        return map;
                    }, {});
                    // map of games...
                    var gamesByAppId = {};
                    var gameOwnersByAppId = {};
                    for (var i = 1; i < responses.length; i++) {
                        var games = responses[i].response.games;
                        if (typeof games === 'undefined') {
                            console.error('games was undefined at index ' + i + ' of ' + responses.length, JSON.stringify(responses[i], null, 4));
                        }
                        else {
                            var steamid = ids[i - 1];
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

                    res.status(200)
                    res.write('<table border=1 cellspacing=1 cellpadding=4>');

                    // logos
                    res.write('<tr><th></th><th>')
                    res.write(ids.map(function(id) {
                        return '<img src="' + friendsBySteamId[id].avatarmedium + '"></img>'
                    }).join('</th><th>'));
                    res.write('</th></tr>');

                    // names
                    res.write('<tr><th>(Game Name)</th><th>')
                    res.write(ids.map(function(id) {
                        return '<a href="' + friendsBySteamId[id].profileurl + '">' + friendsBySteamId[id].personaname + '</a>';
                    }).join('</th><th>'));
                    res.write('</th></tr>');

                    // games
                    Object.keys(gamesByAppId).forEach(function(appid) {
                        var game = gamesByAppId[appid];
                        var owners = gameOwnersByAppId[appid];
                        res.write('<tr><th><img title="' + game.name + '" src="http://media.steampowered.com/steamcommunity/public/images/apps/' + appid + '/' + game.img_logo_url + '.jpg"></img></th><th>');
                        // and whether the user is an owner...
                        res.write(ids.map(function(id) {
                            return owners.indexOf(id) !== -1 ? 'TRUE' : '';
                        }).join('</th><th>'));
                        res.write('</th></tr>');
                    });
                    res.end('</table>');

                },
                function(error) {
                    res.status(400).send(error);
                })
        }, API.sendError(res));

    });

http.createServer(app).listen(LOCAL_SERVER_PORT);

console.log('Server started - http://127.0.0.1:' + LOCAL_SERVER_PORT + '/api/friends/<YOUR_STEAM_ID>');
