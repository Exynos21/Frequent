const express = require('express'); // Import Express
const axios = require('axios'); // Import Axios
const bodyParser = require('body-parser'); // Import Body-parser
const cors = require('cors'); // Import CORS
const stopword = require('stopword'); // Import Stopword

const app = express(); // Initialize Express
const PORT = 3000; // Define server port

// Use CORS middleware
app.use(cors());

// Middleware to parse JSON bodies
app.use(bodyParser.json());

const puppeteer = require('puppeteer');

// In-memory cache to store results for URLs
const urlCache = {}; 

app.post('/analyze', async (req, res) => {
    const { url, removeStopwords, removeNumbers, n, minFrequency } = req.body;

    // Validate URL format
    if (!url || !/^https?:\/\/[^\s$.?#].[^\s]*$/gm.test(url)) {
        return res.status(400).json({ error: 'Invalid URL format. Please enter a valid URL.' });
    }

    // Check if the result for the URL is already cached
    if (urlCache[url]) {
        return res.json({ wordFrequencies: urlCache[url] });
    }

    try {
        // Launch Puppeteer in headless mode
        const browser = await puppeteer.launch({
            headless: true, // Ensures headless mode
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // Helps in some environments
        });
        
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'load', timeout: 0 }); // Waits for the full page load

        // Optionally add a delay to ensure JavaScript execution completes
        await new Promise(resolve => setTimeout(resolve, 5000));
 
        // Extract readable text from the page
        const content = await page.evaluate(() => {
            return Array.from(document.body.querySelectorAll('*'))
                .filter(el => el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE')
                .map(el => el.innerText ? el.innerText.trim() : '') // Handle undefined innerText
                .filter(text => text.length > 0) // Filter out empty strings
                .join(' ');
        });

        await browser.close();

        // If content is empty, return an error
        if (!content.trim()) {
            return res.status(404).json({ error: 'The provided URL has no readable content.' });
        }

        const wordCounts = {};
        let words = content.toLowerCase().match(/\b\w+\b/g); // Extract words

        if (words) {
            // Remove numbers if requested
            if (removeNumbers) {
                words = words.filter(word => isNaN(word));
            }

            // Remove stopwords if requested
            if (removeStopwords) {
                words = stopword.removeStopwords(words);
            }

            // Count word frequencies
            words.forEach(word => {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });
        }

        // Sort words by frequency and apply minimum frequency filter
        const sortedWordCounts = Object.entries(wordCounts)
            .sort(([, a], [, b]) => b - a) // Sort by frequency
            .filter(([word, count]) => !minFrequency || count >= minFrequency) // Filter by minFrequency
            .slice(0, n || 10) // Limit to top N words
            .map(([word, count]) => ({ word, count }));

        // Cache the result
        urlCache[url] = sortedWordCounts;

        res.json({ wordFrequencies: sortedWordCounts });
    } catch (error) {
        console.error('Error details:', error); // Log the full error for debugging
        if (error.response) {
            return res.status(error.response.status).json({ error: `Failed to fetch page: ${error.response.statusText}` });
        }
        res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
