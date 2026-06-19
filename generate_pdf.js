const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'db.json');
const htmlPath = path.join(__dirname, 'pdf_export.html');
const tempHtmlPath = path.join(__dirname, 'temp_print_ready.html');
const pdfOutputPath = path.join(__dirname, 'Kuala_Lumpur_Singapore_Family_Adventure.pdf');

const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Inject itinerary data directly for immediate synchronous execution
const syncLoaderScript = `
    window.addEventListener('DOMContentLoaded', () => {
      const daysData = ${JSON.stringify(dbData.itinerary || [])};
      renderDays(daysData);
      // Populate page number placeholder
      document.querySelectorAll('.page-number').forEach(el => el.textContent = '1-10');
    });
`;

htmlContent = htmlContent.replace("window.addEventListener('DOMContentLoaded', loadItineraryForPDF);", syncLoaderScript);

fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');
console.log("Prepared standalone HTML sheet with injected database records.");

const browserExecutables = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
];

let selectedBrowser = null;
for (const exe of browserExecutables) {
  if (fs.existsSync(exe)) {
    selectedBrowser = exe;
    break;
  }
}

if (selectedBrowser) {
  console.log(`Detected headless-capable browser engine: ${selectedBrowser}`);
  try {
    const cmd = `"${selectedBrowser}" --headless --disable-gpu --allow-file-access-from-files --virtual-time-budget=3000 --print-to-pdf="${pdfOutputPath}" "file://${tempHtmlPath}"`;
    execSync(cmd, { stdio: 'inherit' });
    console.log(`================================================================`);
    console.log(`SUCCESS: PDF created at -> ${pdfOutputPath}`);
    console.log(`================================================================`);
  } catch (err) {
    console.error("Headless PDF print failed:", err.message);
  }
} else {
  console.log("No supported Chromium-based browser found in /Applications. Standalone HTML print sheet retained.");
}

if (fs.existsSync(tempHtmlPath)) {
  fs.unlinkSync(tempHtmlPath);
}
