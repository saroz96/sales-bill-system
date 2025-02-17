const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const mongoose = require('mongoose');

let win;

// Function to create the Electron window
function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'assets/icons/icon.ico'), // Set the same icon here
    webPreferences: {
      nodeIntegration: true
    }
  });

  // Load your EJS-based app in Electron
  win.loadURL('http://localhost:3000'); // Assuming your server runs on port 3000

  // Open DevTools (optional)
  // win.webContents.openDevTools();
}

// This runs when the Electron app is ready
app.whenReady().then(() => {
  // Start the MongoDB server (if required)
  // You can remove or customize this if you're using a cloud DB like MongoDB Atlas
  mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/sales-bill-system', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log('MongoDB connected');
      // Start the Express server
      exec('npm start', (err, stdout, stderr) => {
        if (err) {
          console.error(`Error starting server: ${err}`);
          return;
        }
        console.log(stdout);
      });

      // Create the Electron window
      createWindow();
    })
    .catch(err => {
      console.log('MongoDB connection error:', err);
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
