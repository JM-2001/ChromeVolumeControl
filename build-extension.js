// Import required modules for file system operations and running shell commands
// These are built-in Node.js modules and do not require installation
import { execSync } from "child_process"; // For running shell commands synchronously
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "fs"; // File system operations
import { join } from "path"; // Path manipulation utilities

/**
 * Chrome Extension Build Script
 *
 * This script builds the Volume Controller Chrome extension by:
 * 1. Compiling the Svelte app for the extension's popup UI
 * 2. Building extension-specific scripts (background, content scripts)
 * 3. Copying static assets and manifest.json to the distribution folder
 */

// Create output directory (dist) if it doesn't exist
if (!existsSync("dist")) {
  mkdirSync("dist");
}

// Build the main Svelte application (popup UI)
// This creates the HTML/CSS/JS bundle for the extension's user interface
console.log("Building Svelte app...");
execSync("vite build", { stdio: "inherit" }); // Use stdio: inherit to see build output in console

// Build extension-specific JavaScript files (background.js, content.js)
// These scripts run in different contexts than the popup UI
console.log("Building extension scripts...");
execSync("vite build --config vite.extension.config.js", { stdio: "inherit" });

// Copy the extension's manifest file to the distribution folder
// The manifest.json defines extension metadata, permissions, and entry points
console.log("Copying manifest.json...");
copyFileSync("manifest.json", join("dist", "manifest.json"));

// Set up assets directory structure in the distribution folder
// This will hold icons and other static files needed by the extension
const assetsDir = join("dist", "src", "assets");
if (!existsSync(assetsDir)) {
  mkdirSync(assetsDir, { recursive: true }); // Create nested directories as needed
}

// Copy all asset files from source to distribution
// These include icons, images, and other static resources
console.log("Copying assets...");
readdirSync(join("src", "assets")).forEach((file) => {
  copyFileSync(join("src", "assets", file), join(assetsDir, file));
});

// Notify user that build process is complete
console.log("Build complete! Extension is in the dist directory.");
// The dist directory can now be loaded as an unpacked extension in Chrome,
// or packaged into a .crx file for distribution
