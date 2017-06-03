chrome.runtime.onMessage.addListener(function (msg, sender, callback) {
	if(msg.text === 'get_vk_songs'){
		fetchVkSongs(callback);
		return true;
	}
});

function fetchVkSongs(callback){
	fetched = []
	function scroll(){
	    newFetched = document.querySelectorAll(".audio_row")
	    if (newFetched.length != fetched.length){
	        fetched = newFetched;
	        fetched[fetched.length - 1].scrollIntoView(true);
	        setTimeout(scroll, 200);
	    }else{
	    	songs = [];
			fetched.forEach(function(el, i, ar){
			   songs.push(el.textContent.split('\n').sort(function (a, b) { return b.length - a.length;})[0].trim())
			});
			callback(songs);
	    }
	}
	scroll();	
}

