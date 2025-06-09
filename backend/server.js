const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const writeFile = require('write-excel-file/node');
const collect = require('collect.js');
const { Builder, By } = require('selenium-webdriver');
const webdriver = require('selenium-webdriver');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "http://localhost:4200",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration
const urls = {
    "Hitachi Washing Machine BD-80YCV": "https://www.price.com.hk/product.php?p=384854",
    "LG Washing Machine FVBA90M4G": "https://www.price.com.hk/product.php?p=661609",
    "TGC Gas Water Heater RJW15SD": "https://www.price.com.hk/product.php?p=525001",
    "TGC Gas Water Heater RJW20SN": "https://www.price.com.hk/product.php?p=525005"
};

const toEng = {
    "一星級商戶": "1",
    "二星級商戶": "2",
    "三星級商戶": "3",
    "四星級商戶": "4",
    "五星級商戶": "5"
};

const schema = [
    {
        column: 'Name',
        type: String,
        value: dealer => dealer.name
    },
    {
        column: 'Price',
        type: String,
        value: dealer => dealer.price
    },
    {
        column: 'Address',
        type: String,
        value: dealer => dealer.addr
    },
    {
        column: 'Ranking',
        type: String,
        value: dealer => dealer.star
    },
    {
        column: 'URL',
        type: String,
        value: dealer => dealer.buyURL
    }
];

class WebScrapingEngine {
    constructor(socket) {
        this.socket = socket;
        this.driver = null;
        this.isRunning = false;
    }

    async initialize() {
        try {
            this.driver = await new Builder().forBrowser('MicrosoftEdge').build();
            this.socket.emit('status', { message: 'WebDriver initialized successfully', type: 'success' });
        } catch (error) {
            this.socket.emit('error', { message: `Failed to initialize WebDriver: ${error.message}`, type: 'error' });
            throw error;
        }
    }

    async processEachItem(elem) {
        let fullText = await elem.getText();
        let merchantName, price, address, star, buyURL;

        try {
            merchantName = await elem.findElement(By.className("quotation-merchant-name")).getText();
        } catch (error) {
            console.log("Can't find merchant name. Skip");
            return null;
        }

        try {
            price = await elem.findElement(By.className("product-price ")).getText();
        } catch (error) {
            try {
                price = await elem.findElement(By.className("product-price product-price-cheap")).getText();
            } catch (error) {
                try {
                    price = await elem.findElement(By.className("text-price-number fx")).getText();
                } catch (error) {
                    console.error("No price for " + merchantName);
                    return null;
                }
            }
        }

        try {
            address = await elem.findElement(By.className("quotation-merchant-address")).getText();
        } catch (error) {
            address = "";
        }

        try {
            star = await elem.findElement(By.className("quotation-merchant-level")).getText();
        } catch (error) {
            star = "";
        }

        try {
            buyURL = await elem.findElement(By.className("fb_iframe new_referral_btn -fast")).getAttribute('href');
        } catch (error) {
            buyURL = "";
        }

        return {
            name: merchantName,
            price: price,
            addr: address,
            star: toEng[star] || star,
            buyURL: buyURL
        };
    }

    async scrapeProduct(productName, url) {
        let nextPage = true;
        let objects = [];
        let currentUrl = url;
        let pageCount = 0;

        this.socket.emit('progress', { 
            product: productName, 
            message: `Starting to scrape ${productName}...`,
            page: 0
        });

        while (nextPage && this.isRunning) {
            try {
                await this.driver.get(currentUrl);
                pageCount++;
                
                this.socket.emit('progress', { 
                    product: productName, 
                    message: `Scraping page ${pageCount}...`,
                    page: pageCount
                });

                const pendingItemElements = await this.driver.findElements(By.xpath('//div[@class="item clearfix"]'));
                
                for (let elem of pendingItemElements) {
                    if (!this.isRunning) break;
                    
                    const item = await this.processEachItem(elem);
                    if (item) {
                        objects.push(item);
                        this.socket.emit('item_found', { 
                            product: productName, 
                            item: item,
                            total: objects.length
                        });
                    }
                }

                try {
                    currentUrl = await this.driver.findElement(By.xpath('//*[@class="next-btn"]/a')).getAttribute('href');
                } catch (error) {
                    currentUrl = null;
                }

                if (currentUrl == null) {
                    nextPage = false;
                }

                await this.driver.sleep(2000); // Add delay between pages
            } catch (error) {
                this.socket.emit('error', { 
                    product: productName, 
                    message: `Error scraping page: ${error.message}`,
                    type: 'warning'
                });
                break;
            }
        }

        this.socket.emit('product_complete', {
            product: productName,
            count: objects.length,
            message: `Completed scraping ${productName}: ${objects.length} items found`
        });

        return objects;
    }

    async startScraping(selectedProducts = null) {
        if (this.isRunning) {
            this.socket.emit('error', { message: 'Scraping is already running', type: 'warning' });
            return;
        }

        this.isRunning = true;
        let objectsArr = [];
        let sheetArr = [];
        let schemaArr = [];

        try {
            await this.initialize();

            const productsToScrape = selectedProducts || Object.keys(urls);
            
            this.socket.emit('scraping_started', {
                message: 'Web scraping started',
                totalProducts: productsToScrape.length,
                products: productsToScrape
            });

            for (let i = 0; i < productsToScrape.length && this.isRunning; i++) {
                const productName = productsToScrape[i];
                const url = urls[productName];

                this.socket.emit('progress', {
                    current: i + 1,
                    total: productsToScrape.length,
                    product: productName,
                    message: `Processing ${productName} (${i + 1}/${productsToScrape.length})`
                });

                const objects = await this.scrapeProduct(productName, url);
                
                if (objects.length > 0) {
                    objectsArr.push([...objects]);
                    schemaArr.push(schema);
                    sheetArr.push(productName);
                }
            }

            if (this.isRunning && objectsArr.length > 0) {
                const fileName = `scraping_results_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
                await writeFile(objectsArr, {
                    schema: schemaArr,
                    sheets: sheetArr,
                    filePath: fileName
                });

                this.socket.emit('scraping_complete', {
                    message: 'Web scraping completed successfully!',
                    fileName: fileName,
                    totalProducts: objectsArr.length,
                    results: objectsArr.map((arr, index) => ({
                        product: sheetArr[index],
                        count: arr.length,
                        items: arr
                    }))
                });
            }

        } catch (error) {
            this.socket.emit('error', {
                message: `Scraping failed: ${error.message}`,
                type: 'error'
            });
        } finally {
            this.isRunning = false;
            if (this.driver) {
                await this.driver.quit();
                this.driver = null;
            }
        }
    }

    stopScraping() {
        this.isRunning = false;
        this.socket.emit('status', { message: 'Scraping stopped by user', type: 'info' });
    }
}

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    const scraper = new WebScrapingEngine(socket);

    socket.emit('connected', { 
        message: 'Connected to scraping server',
        availableProducts: Object.keys(urls)
    });

    socket.on('start_scraping', (data) => {
        console.log('Starting scraping for:', data);
        scraper.startScraping(data.selectedProducts);
    });

    socket.on('stop_scraping', () => {
        console.log('Stopping scraping for:', socket.id);
        scraper.stopScraping();
    });

    socket.on('get_products', () => {
        socket.emit('products_list', {
            products: Object.keys(urls),
            urls: urls
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        scraper.stopScraping();
    });
});

// REST API endpoints
app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

app.get('/api/products', (req, res) => {
    res.json({
        products: Object.keys(urls),
        urls: urls
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server ready for connections`);
});