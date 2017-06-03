var parseKeyValues = function(body) {
    var obj = {};
    body.split("\n").forEach(function(line) {
        var pos = line.indexOf("=");
        if(pos > 0) obj[line.substr(0, pos)] = line.substr(pos+1);
    });
    return obj;
};

var PlayMusic = function() {};

PlayMusic.prototype._baseURL = 'https://www.googleapis.com/sj/v1.11/';
PlayMusic.prototype._authURL = 'https://android.clients.google.com/auth';

PlayMusic.prototype.init = function(config, callback) {
    var that = this;
    this._email = config.email;
    this._password = config.password;
    this._masterToken = config.masterToken;

    this._oauth(function(err, data) {
        if(err) return callback(new Error("Unable to create oauth token" + err));
        that._token = data.Auth;
        callback(null);
    });
};

PlayMusic.prototype._oauth = function(callback) {
    var that = this;
    var data = {
        accountType: "HOSTED_OR_GOOGLE",
        has_permission: 1,
        service: "sj",
        source: "android",
        app: "com.google.android.music",
        device_country: "us",
        operatorCountry: "us",
        lang: "en",
        sdk_version: "17"
    };
    if(this._masterToken) {
        data.Token = this._masterToken;
    } else if(this._password) {
        data.Passwd = this._password;
        data.Email = that._email.trim();
    } else {
        callback(new Error("You must provide either an email address and password, or a token"));
    }
    _doAuth(0, this, data, callback);
};

function _doAuth(ind, that, data, callback){
    that.request({
        type: "POST",
        url: that._authURL,
        data: data,
    },  function(err, res) {
        if(err && ind < 10){
            console.log('Attempt ' + ind);
            setTimeout(function(){_doAuth(ind + 1, that, data, callback)}, 500);
        }else{
            chrome.tabs.getSelected(null, function(tab) {
              var code = 'window.location.reload();';
              chrome.tabs.executeScript(tab.id, {code: code});
            });
            callback(err, err ? null : parseKeyValues(res));   
        }
    });
}

PlayMusic.prototype.request = function(opt, callback) {
    opt.type = opt.type || "GET";
    if(typeof this._token !== "undefined"){
        opt.headers = {};
        opt.headers.Authorization = "GoogleLogin auth=" + this._token;
    }
    $.ajax(opt).done(
        function(data){
            callback(null, data);
        }
    ).fail(
        function(err){
            console.error(err);
            callback(err, null);
        }
    );
};

PlayMusic.prototype.getPlayLists = function (callback) {
    var that = this;
    this.request({
        type: "POST",
        url: this._baseURL + 'playlistfeed'
    }, function(err, body) {
        callback(err ? new Error("error getting playlist results: " + err) : null, body);
    });
};

PlayMusic.prototype.search = function (text, maxResults, callback) {
    var that = this;
    var qp = {
        q: text,
        ct: '1,2,3,4,5,6,7,8,9',
        "max-results": maxResults
    };
    var qstring = $.param(qp);
    this.request({
        type: "GET",
        url: this._baseURL + 'query?' + qstring
    }, function(err, data) {
        callback(err ? new Error("error getting search results: " + err) : null, data);
    });
};

function getUUID(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
});
}

PlayMusic.prototype.addTrackToPlayList = function (songIds, playlistId, callback) {
    var that = this;
    var songIdsArray = Array.isArray(songIds) ? songIds : [songIds];
    var mutations = [];
    songIdsArray.forEach(function(songId) {
        mutations.push(
            {
                "create": {
                    "clientId": getUUID(),
                    "creationTimestamp": "-1",
                    "deleted": "false",
                    "lastModifiedTimestamp": "0",
                    "playlistId": playlistId,
                    "source": (songId.indexOf("T") === 0 ? "2" : "1"),
                    "trackId": songId
                }
            }
        );
    });
    this.request({
        type: "POST",
        contentType: "application/json",
        url: this._baseURL + 'plentriesbatch?' + $.param({alt: "json"}),
        data: JSON.stringify({"mutations": mutations})
    }, function(err, body) {
        callback(err ? new Error("error adding tracks to playlist: " + err) : null, body);
    });
};

PlayMusic.prototype.addPlayList = function (playlistName, callback) {
    var that = this;
    var mutations = [
    {
        "create": {
            "creationTimestamp": -1,
            "deleted": false,
            "lastModifiedTimestamp": 0,
            "name": playlistName,
            "type": "USER_GENERATED"
        }
    }
    ];
    this.request({
        type: "POST",
        contentType: "application/json",
        url: this._baseURL + 'playlistbatch?' + $.param({alt: "json"}),
        data: JSON.stringify({"mutations": mutations})
    }, function(err, body) {
        callback(err ? new Error("error creating playlist " + err) : null, body);
    });
};

function catchVkTab(callback){
    chrome.tabs.query({}, function(tabs){
        var found = false;
        for (var i =0; i< tabs.length; i++){
            if(tabs[i].url && tabs[i].url.indexOf('vk.com') > -1){
                callback(tabs[i].id);
                found = true;
                break;
            }
        }
        if(!found){
            failMigration('Please open vk.com tab, login, and go to music page');
        }
    });
}

function addSongsToGM(login, pass, playlistName){
    var pm = new PlayMusic();
    pm.init({email: login, password: pass}, function(err) {
        if(err){
            failMigration('Failed to connect to Google Music ' + err);
        }else{
            var playlistId = null;
            pm.getPlayLists(function(err, data){
                if(err){
                    failMigration('Failed to fetch playlists ' + err);
                } else {
                    if(data.data){
                        var playlists = data.data.items;
                        if(playlists){
                            for(var ind =0; ind < playlists.length; ind++){
                                if(playlists[ind].name === playlistName){
                                    playlistId = playlists[ind].id;  
                                    break;
                                }
                            }
                        }
                    }
                    if(!playlistId){
                        pm.addPlayList(playlistName, function(err, data){
                            if(data && data.mutate_response){
                                addSongsToPlaylist(pm, data.mutate_response[0].id);
                            }else{
                                failMigration('Failed to create playlist ' + err);
                            }
                        });
                    }else{
                        addSongsToPlaylist(pm, playlistId);
                    } 
                }
            });
        }
    });
}

function addSongsToPlaylist(pm, pId){
    var done = 0;
    var doneDef = $.Deferred();
    for(var i = 0; i < songs.length; i++){
        if(songs[i]){
            pm.search(songs[i], 1, function(err, data){
                if(data && data.entries){
                    var songId = null;
                    for(var j=0; j < data.entries.length; j++){
                        if(data.entries[j].track){
                            songId = data.entries[j].track.storeId;
                            break;
                        }
                    }
                    if(songId){
                        pm.addTrackToPlayList(songId, pId, function(err, data){
                            if (err){
                                console.error('Failed to migrate song ' + songs[i] + err, ', please try again later.');
                            }else{
                                console.log('Migrated ' + songs[i])
                            }
                            done += 1;
                            doneDef.notify(done);
                        }); 
                    }else{
                        console.error('Could not find song in Google Music: ' + songs[i]);
                        done += 1;
                        doneDef.notify(done);
                    }
                }else{
                    console.error('Failed to migrate song ' + songs[i] + err);
                    done += 1;
                    doneDef.notify(done);
                }
            });
        }else{
            done += 1;
            doneDef.notify(done);
        }
    }
    doneDef.progress(function(v){
        if(v == songs.length){
            doneDef.resolve();
            failMigration('Done!');
        }
    });
}

function failMigration(s){
    $('#fountainG').hide()
    alert(s);
}

var songs = []
function migrateSongs(login, pass, playlistName){
    if(login && pass && playlistName){
        $('#progressbar').attr('display', 'block');
        if (songs.length > 0){
            addSongsToGM(login, pass, playlistName);
        }else{
            catchVkTab(function(tabId){
                chrome.tabs.sendMessage(tabId, {text: 'get_vk_songs'}, function(newSongs){
                    if (newSongs){
                        songs = newSongs;
                        addSongsToGM(login, pass, playlistName);    
                    }else{
                        failMigration('Could not fetch songs from vk. Open vk music tab and try again');
                    }
                });
            });        
        }
    }else{
        failMigration('Please input credentials');
    }
}

var translate = function (lang){ 
    $.getJSON('lang/'+lang+'.json', function(jsdata){
        $("[tkey]").each (function (index){
            var strTr = jsdata[$(this).attr('tkey')];
            if($(this).attr('type') === 'button'){
                $(this).attr('value', strTr);
            }else{
                $(this).html (strTr);
            }
        });
    });
}


// Serving screen
$(function(){
    $('#transfer').click(function(){
        $('#fountainG').show();
        migrateSongs(
            $('#googleLogin').val(), 
            $('#googlePassword').val(), 
            $('#playlistName').val()
            );
    });
    $('#language_box img').click(function(){
        $('#language_box img').removeClass('selected');
        $(this).addClass('selected');
        translate($(this).attr('alt'));
    });
    translate($('#language_box img.selected').attr('alt'));
        
});

