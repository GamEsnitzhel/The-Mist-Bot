const { Discord, Permissions } = require("discord.js");
const { Client } = require("pg");
const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
let connected = false;

let countingChannelsCache = [];

module.exports = {
    dbConnect: function(message) {
        dbClient.connect(err => {
            if (err) {
                console.error('Connection error while connecting to database: ' + err.stack);
            } else {
                console.log('Connected to Database');
                connected = true;
                dbClient.query("CREATE TABLE IF NOT EXISTS wishlist_users (discordid VARCHAR(255) PRIMARY KEY, steamsnippet VARCHAR(255), gamelist TEXT);", function (error, results) {
                    if (error) console.log("[WISHLIST] Error creating wishlist_users table: " + error);
                });
                dbClient.query("CREATE TABLE IF NOT EXISTS wishlist_games (gameid VARCHAR(255) PRIMARY KEY, lastprice VARCHAR(255));", function (error, results) {
                    if (error) console.log("[WISHLIST] Error creating wishlist_games table: " + error);
                });
            }
          });
    },
    getCountingChannels: async function() {
        if (countingChannelsCache.length == 0) {
            const res = await dbClient.query("SELECT channelid FROM counting;");
            countingChannelsCache = res.rows.map(x => x["channelid"]);
        }
        return countingChannelsCache;
    },
    getMaxCount: async function(message, lookupChannel) {
        if (lookupChannel) {
                const res = await dbClient.query(`SELECT * FROM counting WHERE channelid=${lookupChannel.id};`);
                if (res.rows.length == 0) return message.channel.send("Counting has not been enabled in this channel.");
                message.channel.send(`The highest ever count in **${lookupChannel.guild.name}** <#${lookupChannel.id}> was \`${res.rows[0]["maxcount"]}\`.`);
        }
        else {
            const res = await dbClient.query(`SELECT * FROM counting WHERE channelid=${message.channel.id};`);
            if (res.rows.length == 0) return message.channel.send("Run this command in a **counting channel** to see the highest ever count in that channel!")
            message.channel.send(`The highest ever count in **${message.guild.name}** <#${message.channel.id}> was \`${res.rows[0]["maxcount"]}\`.`);
        }
    },
    getCurrentCount: async function(message, api) {
        if (api == true) {
            const res = await dbClient.query(`SELECT * FROM counting WHERE channelid=${message.channel.id};`);
            if (res.rows.length == 0) return null;
            return res.rows[0]["count"]
        }
    },
    count: async function (message) {
        if (connected == false) {
            message.react("❎").catch((err) => {return;});
            message.channel.send("We're having issues **connecting to our database**. Please try again later. If this issue persists, contact R2D2Vader#0693");
            return;
        }
        const resObj = await dbClient.query(`SELECT * FROM counting WHERE channelid=${message.channel.id};`)
        let res = resObj.rows[0]
        if (message.content == parseInt(res["count"]) + 1) {
            if (res["lastusertocount"] != message.member.id) {
                await dbClient.query(`UPDATE counting SET count=${parseInt(res["count"]) + 1}, lastusertocount=${message.member.id} WHERE channelid=${message.channel.id}`)
                message.react("<a:mistbot_confirmed:870070841268928552>").catch((err) => {message.channel.send("<a:mistbot_confirmed:870070841268928552>")});
            }
            else {
                await dbClient.query(`UPDATE counting SET count=0, lastusertocount=-1 WHERE channelid=${message.channel.id}`)
                message.channel.send("**<@" + message.member.id + ">** ruined the count at `" + res["count"] + "`! You cannot count **twice in a row**. `The count reset.`");
                message.react("❌").catch((err) => {return;});
                message.channel.send("Next number is `1`.");
                return;
            }
        }
        else {
            await dbClient.query(`UPDATE counting SET count=0, lastusertocount=-1 WHERE channelid=${message.channel.id}`)
            message.channel.send("**<@" + message.member.id + ">** ruined the count at `" + res["count"] + "`! `The count reset.`");
            message.react("❌").catch((err) => {return;});
            message.channel.send("Next number is `1`.");
            return;
        }

        if (parseInt(res["count"]) + 1 > parseInt(res["maxcount"])) {
            dbClient.query(`UPDATE counting SET maxcount = ${parseInt(res["count"]) + 1} WHERE channelid=${message.channel.id}`)
        }

    },
    enableCounting: async function(message) {
        let channels = countingChannelsCache;
        if (channels.includes(message.channel.id)) {
            message.channel.send("Counting is already enabled in this channel!")
        }
        else if (message.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
            await dbClient.query(`INSERT INTO counting (channelid, maxcount, count, lastusertocount) VALUES (${message.channel.id},0,0,-1);`);
            message.channel.send("Counting is now enabled! The next number is `1`.");
            updateCache();
        }
        else {
            message.channel.send("You **don't have permission to do that**! Get someone who can `Manage Channels` to set counting up for you.")
        }
    },
    disableCounting: async function(message) {
        let channels = countingChannelsCache;
        if (!channels.includes(message.channel.id)) {
            message.channel.send("Counting isn't enabled in this channel!")
        }
        else if (message.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
            await dbClient.query(`DELETE FROM counting WHERE channelid=${message.channel.id};`);
            message.channel.send("Counting is now disabled! Sorry to see you go 😦");
            updateCache();
        }
        else {
            message.channel.send("You **don't have permission to do that**! Get someone who can `Manage Channels` to turn counting off for you.")
        }
    },
    setDisconnected: function() {
        connected = false;
    },
    getSubscribedChannels: async function() {
        const res = await dbClient.query("SELECT channelid FROM subscribed;");
        return res.rows.map(x => x["channelid"]);
    },
    subscribe: async function(message) {
        if (message.channel.type != "GUILD_TEXT") return message.channel.send("Updates can only be subscribed to in a Server Text Channel!");
        const res = await dbClient.query("SELECT channelid FROM subscribed;");
        let array = res.rows.map(x => x["channelid"]);

        if (array.includes(message.channel.id)) {
            message.channel.send("This channel is already subscribed to updates!")
        }
        else if (message.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
            await dbClient.query(`INSERT INTO subscribed (channelid) VALUES (${message.channel.id});`);
            message.channel.send("This channel is now subscribed to updates!");
        }
        else {
            message.channel.send("You **don't have permission to do that**! Get someone who can `Manage Channels` to subscribe to updates for you.")
        }
    },
    unsubscribe: async function(message) {
        const res = await dbClient.query("SELECT channelid FROM subscribed;");
        let array = res.rows.map(x => x["channelid"]);

        if (!array.includes(message.channel.id)) {
            message.channel.send("This channel isn't subscribed to updates!")
        }
        else if (message.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
            await dbClient.query(`DELETE FROM subscribed WHERE channelid=Cast(${message.channel.id} As varchar);`);
            message.channel.send("This channel is now unsubscribed from updates!");
        }
        else {
            message.channel.send("You **don't have permission to do that**! Get someone who can `Manage Channels` to unsubscribe from updates for you.")
        }
    },
    // wishlist mysql database file
    w_addUser(discordId, steamSnippet) {
        return new Promise((resolve, reject) => {
            dbClient.query("INSERT INTO wishlist_users (discordid, steamsnippet) VALUES ($1, $2)", [discordId, steamSnippet], function (error, results) {
                if (error) reject(error);
                resolve(results);
            });
        });
    },
    w_getUser(discordId) {
        return new Promise((resolve, reject) => {
            dbClient.query("SELECT * FROM wishlist_users WHERE discordid = $1", [discordId], function (error, results) {
                if (error) reject(error);
                resolve(results);
            });
        });
    },
    w_deleteUser(discordId) {
        return new Promise((resolve, reject) => {
            dbClient.query("DELETE FROM wishlist_users WHERE discordid = $1", [discordId], function (error, results) {
                if (error) reject(error);
                resolve(results);
            });
        });
    },
    w_writeWishlist(discordId, wishlistString) {
        return new Promise((resolve, reject) => {
            dbClient.query("UPDATE wishlist_users SET gamelist = $1 WHERE discordid = $2", [wishlistString, discordId], function (error, results) {
                if (error) reject(error);
                resolve(results);
            });
        })
    },
    w_getAllUsers() {
        return new Promise((resolve, reject) => {
            dbClient.query("SELECT * FROM wishlist_users", function (error, results) {
                if (error) reject(error);
                resolve(results);
            });
        });
    },
    w_updateGame(gameId, price) {

        // Internal function declaration
        const insertIntoGames = (gameId, price, resolve, reject) => {
            dbClient.query("INSERT INTO wishlist_games (gameid, lastprice) VALUES ($1, $2)", [gameId, price], function (error, results) {
                if (error) reject(error);
                resolve(-1);
            });
        }
        const updateGames = (gameId, price, oldPrice, resolve, reject) => {
            dbClient.query("UPDATE wishlist_games SET lastprice = $1 WHERE gameid = $2", [price, gameId], function (error, results) {
                if (error) reject(error);
                resolve(oldPrice);
            });
        }

        return new Promise((resolve, reject) => {
            dbClient.query("SELECT * FROM wishlist_games WHERE gameid = $1", [gameId], function (error, results) {
                if (error) reject(error);
                if (results.rowCount < 1) {
                    insertIntoGames(gameId, price, resolve, reject);
                }
                else {
                    updateGames(gameId, price, results.rows[0]["lastprice"], resolve, reject);
                }
            });
        });
    }
}

async function updateCache() {
    const res = await dbClient.query("SELECT channelid FROM counting;");
    countingChannelsCache = res.rows.map(x => x["channelid"]);
}

module.exports.updateCache = updateCache;