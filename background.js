chrome.runtime.onInstalled.addListener(() => {
  console.log('RecOtto extension installed');
});

chrome.runtime.onConnect.addListener(function(port) {
  console.assert(port.name === "recotto-port");
  console.log('New connection established');
  
  port.onMessage.addListener(function(request) {
    console.log('Received message in background script:', request);

    if (request.action === 'saveRecording') {
      chrome.storage.local.get('recordings', (data) => {
        let recordings = data.recordings || [];
        if (!Array.isArray(recordings)) {
          console.error('Recordings is not an array, resetting to empty array');
          recordings = [];
        }
        recordings.push(request.recording);
        chrome.storage.local.set({ recordings: recordings }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving recording:', chrome.runtime.lastError);
            port.postMessage({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log('Recording saved successfully');
            port.postMessage({ success: true });
          }
        });
      });
    } else if (request.action === 'getRecordings') {
      chrome.storage.local.get('recordings', (data) => {
        if (chrome.runtime.lastError) {
          console.error('Error fetching recordings:', chrome.runtime.lastError);
          port.postMessage({ success: false, error: chrome.runtime.lastError.message });
        } else {
          let recordings = data.recordings || [];
          if (!Array.isArray(recordings)) {
            console.error('Recordings is not an array, resetting to empty array');
            recordings = [];
          }
          console.log('Fetched recordings:', recordings);
          port.postMessage({ success: true, recordings: recordings });
        }
      });
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('Port disconnected');
  });
});