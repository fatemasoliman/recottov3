console.log('RecOtto content script loaded');

let isRecording = false;
let currentRecording = [];
let port;

// Establish connection with background script
function connectToBackground() {
  port = chrome.runtime.connect({name: "recotto-port"});
  port.onDisconnect.addListener(() => {
    console.log('Port disconnected. Attempting to reconnect...');
    setTimeout(connectToBackground, 1000);
  });
}

connectToBackground();

// Helper function to send messages to background script
function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    if (!port || port.disconnected) {
      connectToBackground();
    }
    try {
      port.postMessage(message);
      const listener = function(response) {
        port.onMessage.removeListener(listener);
        resolve(response);
      };
      port.onMessage.addListener(listener);
    } catch (error) {
      console.error('Error sending message:', error);
      reject(error);
    }
  });
}

// Function to save recording
function saveRecording() {
  const name = document.getElementById('recotto-recording-name').value;
  if (name) {
    const recording = {
      name: name,
      actions: currentRecording
    };
    console.log('Attempting to save recording:', recording);
    sendMessageToBackground({ action: 'saveRecording', recording: recording })
      .then(response => {
        if (response && response.success) {
          console.log('Recording saved successfully');
          updateRecordingsList();
          document.getElementById('recotto-save-form').style.display = 'none';
          document.getElementById('recotto-recording-name').value = '';
        } else {
          console.error('Error saving recording:', response ? response.error : 'Unknown error');
          alert('Error saving recording. Please try again.');
        }
      })
      .catch(error => {
        console.error('Error sending message:', error);
        alert('Error saving recording. Please try again.');
      });
  } else {
    alert('Please enter a name for the recording');
  }
}

// Create and inject the drawer component
function injectDrawer() {
  const drawer = document.createElement('div');
  drawer.id = 'recotto-drawer';
  drawer.innerHTML = `
    <div class="recotto-header">
      <h2>RecOtto</h2>
      <button id="recotto-close" aria-label="Close">✕</button>
    </div>
    <div class="recotto-content">
      <button id="recotto-start-recording">Start Recording</button>
      <button id="recotto-stop-recording" style="display: none;">Stop Recording</button>
      <div id="recotto-save-form" style="display: none;">
        <input type="text" id="recotto-recording-name" placeholder="Enter recording name">
        <button id="recotto-save-recording">Save Recording</button>
      </div>
      <div id="recotto-action-log"></div>
      <select id="recotto-recordings"></select>
      <div id="recotto-replay-controls">
        <label for="recotto-replay-speed">Replay Speed:</label>
        <input type="range" id="recotto-replay-speed" min="0.5" max="2" step="0.1" value="1">
        <span id="recotto-replay-speed-value">1x</span>
      </div>
      <button id="recotto-replay">Replay</button>
    </div>
  `;
  document.body.appendChild(drawer);

  // Add event listeners for buttons
  document.getElementById('recotto-close').addEventListener('click', closeDrawer);
  document.getElementById('recotto-start-recording').addEventListener('click', startRecording);
  document.getElementById('recotto-stop-recording').addEventListener('click', stopRecording);
  document.getElementById('recotto-save-recording').addEventListener('click', saveRecording);
  document.getElementById('recotto-replay').addEventListener('click', replayRecording);
  
  // Add event listener for speed control
  const speedControl = document.getElementById('recotto-replay-speed');
  const speedValue = document.getElementById('recotto-replay-speed-value');
  speedControl.addEventListener('input', () => {
    speedValue.textContent = `${speedControl.value}x`;
  });
}

// Function to open the drawer
function openDrawer() {
  const drawer = document.getElementById('recotto-drawer');
  drawer.classList.add('recotto-drawer-open');
}

// Function to close the drawer
function closeDrawer() {
  const drawer = document.getElementById('recotto-drawer');
  drawer.classList.remove('recotto-drawer-open');
}

// Function to start recording
function startRecording() {
  isRecording = true;
  currentRecording = [];
  document.getElementById('recotto-start-recording').style.display = 'none';
  document.getElementById('recotto-stop-recording').style.display = 'inline-block';
  document.getElementById('recotto-action-log').innerHTML = '';
  console.log('Recording started');
  // Add event listeners for user actions here
  document.addEventListener('click', recordClick);
  document.addEventListener('input', recordInput);
  // Add more event listeners as needed
}

// Function to stop recording
function stopRecording() {
  isRecording = false;
  document.getElementById('recotto-start-recording').style.display = 'inline-block';
  document.getElementById('recotto-stop-recording').style.display = 'none';
  document.getElementById('recotto-save-form').style.display = 'block';
  console.log('Recording stopped');
  // Remove event listeners
  document.removeEventListener('click', recordClick);
  document.removeEventListener('input', recordInput);
  // Remove more event listeners as needed
}

// Function to update the recordings list
function updateRecordingsList() {
  console.log('Updating recordings list');
  const select = document.getElementById('recotto-recordings');
  sendMessageToBackground({ action: 'getRecordings' })
    .then(response => {
      if (response && response.success) {
        const recordings = response.recordings;
        console.log('Fetched recordings:', recordings);
        select.innerHTML = '<option value="">Select a recording</option>';
        if (Array.isArray(recordings)) {
          recordings.forEach((recording, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = recording.name;
            select.appendChild(option);
          });
        } else {
          console.error('Recordings is not an array:', recordings);
        }
      } else {
        console.error('Error fetching recordings:', response ? response.error : 'Unknown error');
      }
    })
    .catch(error => {
      console.error('Error sending message:', error);
    });
}

// Function to record a click
function recordClick(event) {
  // Check if the click is within the RecOtto drawer or open drawer button
  if (event.target.closest('#recotto-drawer') || event.target.closest('#recotto-open-drawer')) {
    return; // Don't record clicks within the extension UI
  }

  const action = {
    type: 'click',
    x: event.clientX,
    y: event.clientY,
    target: event.target.tagName,
    timestamp: Date.now()
  };
  currentRecording.push(action);
  logAction(`Clicked ${action.target} at (${action.x}, ${action.y})`);
}

// Function to record input
function recordInput(event) {
  const target = event.target;
  const action = {
    type: 'input',
    value: target.isContentEditable ? target.textContent : target.value,
    target: target.tagName,
    id: target.id,
    className: target.className,
    isContentEditable: target.isContentEditable,
    timestamp: Date.now()
  };
  // Replace the last input action if it's for the same target
  const lastAction = currentRecording[currentRecording.length - 1];
  if (lastAction && lastAction.type === 'input' && lastAction.target === action.target) {
    currentRecording[currentRecording.length - 1] = action;
  } else {
    currentRecording.push(action);
  }
  logAction(`Entered text in ${action.target}`);
}

// Function to log actions in the UI
function logAction(message) {
  const log = document.getElementById('recotto-action-log');
  const entry = document.createElement('div');
  entry.textContent = message;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// Function for replaying
function replayRecording() {
  const select = document.getElementById('recotto-recordings');
  const selectedIndex = select.value;
  if (selectedIndex !== '') {
    sendMessageToBackground({ action: 'getRecordings' })
      .then(response => {
        if (response && response.success) {
          const recordings = response.recordings || [];
          const selectedRecording = recordings[selectedIndex];
          console.log('Replaying recording:', selectedRecording.name);
          replayActions(selectedRecording.actions);
        } else {
          console.error('Error fetching recordings:', response ? response.error : 'Unknown error');
        }
      })
      .catch(error => {
        console.error('Error sending message:', error);
        alert('Error replaying recording. Please try again.');
      });
  } else {
    alert('Please select a recording to replay');
  }
}

// Add this function to create and move the mouse indicator
function createMouseIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'recotto-mouse-indicator';
  indicator.style.cssText = `
    position: fixed;
    width: 10px;
    height: 10px;
    background-color: red;
    border-radius: 50%;
    pointer-events: none;
    z-index: 10001;
    transition: all 0.1s ease-out;
  `;
  document.body.appendChild(indicator);
  return indicator;
}

// Function to replay a series of actions
function replayActions(actions) {
  let index = 0;
  const mouseIndicator = createMouseIndicator();
  showReplayIndicator();
  
  function performNextAction() {
    if (index < actions.length) {
      const action = actions[index];
      const speed = parseFloat(document.getElementById('recotto-replay-speed').value);
      const delay = 300 / speed; // Adjust delay based on speed
      
      switch (action.type) {
        case 'click':
          replayClick(action, mouseIndicator);
          break;
        case 'input':
          replayInput(action);
          break;
        // Add more cases for other action types as needed
      }
      
      showActionIndicator(action);
      index++;
      setTimeout(performNextAction, delay);
    } else {
      hideReplayIndicator();
      mouseIndicator.remove();
    }
  }
  performNextAction();
}

// Function to show action indicator
function showActionIndicator(action) {
  const indicator = document.createElement('div');
  indicator.className = 'recotto-action-indicator';
  indicator.style.left = `${action.x}px`;
  indicator.style.top = `${action.y}px`;
  document.body.appendChild(indicator);
  
  setTimeout(() => {
    indicator.remove();
  }, 1000); // Remove indicator after 1 second
}

// Update replayClick function
function replayClick(action, mouseIndicator) {
  mouseIndicator.style.left = `${action.x}px`;
  mouseIndicator.style.top = `${action.y}px`;
  
  const element = document.elementFromPoint(action.x, action.y);
  if (element) {
    element.focus();
    setTimeout(() => {
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: action.x,
        clientY: action.y
      });
      element.dispatchEvent(clickEvent);
      console.log(`Clicked element at (${action.x}, ${action.y})`);
    }, 100);
  } else {
    console.error(`No element found at (${action.x}, ${action.y})`);
  }
}

// Update replayInput function
function replayInput(action) {
  let element = document.activeElement;
  if (!element || (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA')) {
    element = document.querySelector('input:focus, textarea:focus, [contenteditable=true]:focus');
  }
  if (!element) {
    element = document.querySelector('input, textarea, [contenteditable=true]');
  }
  if (element) {
    if (element.isContentEditable) {
      element.textContent = action.value;
    } else {
      element.value = action.value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`Entered text "${action.value}" in ${element.tagName}`);
  } else {
    console.error(`No suitable input element found for entering text`);
  }
}

// Inject the drawer when the content script loads
injectDrawer();

// Add a button to the page to open the drawer
function addDrawerButton() {
  const button = document.createElement('button');
  button.id = 'recotto-open-drawer';
  button.textContent = 'RecOtto';
  button.addEventListener('click', openDrawer);
  document.body.appendChild(button);
}

addDrawerButton();
updateRecordingsList();

function showReplayIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'recotto-replay-indicator';
  indicator.textContent = 'Replay in progress...';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    background-color: #000FFF;
    color: white;
    padding: 10px;
    border-radius: 5px;
    z-index: 10000;
  `;
  document.body.appendChild(indicator);
}

function hideReplayIndicator() {
  const indicator = document.getElementById('recotto-replay-indicator');
  if (indicator) {
    indicator.remove();
  }
}