import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebScrapingService } from './services/web-scraping.service';
import { Subscription } from 'rxjs';


export interface ScrapingResult {
  product: string;
  count: number;
  items: ScrapingItem[];
}

export interface ScrapingItem {
  name: string;
  price: string;
  addr: string;
  star: string;
  buyURL: string;
}

export interface ProgressInfo {
  current?: number;
  total?: number;
  product?: string;
  message: string;
  page?: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  providers: [WebScrapingService]
})

export class AppComponent implements OnInit, OnDestroy {
  title = 'Web Scraping Engine by George Fung';

  // Connection status
  isConnected = false;
  connectionStatus = '';

  // Scraping state
  isScrapingRunning = false;
  scrapingProgress: ProgressInfo = { message: '' };

  // Available products
  availableProducts: string[] = [];
  selectedProducts: string[] = [];

  // Results
  scrapingResults: ScrapingResult[] = [];
  currentResults: ScrapingItem[] = [];
  totalItemsFound = 0;

  // Activity Logs
  activityLogs: string[] = [];

  // Statistics
  stats = {
    totalProducts: 0,
    completedProducts: 0,
    totalItems: 0
  };

  private subscriptions: Subscription[] = [];

  constructor(private webScrapingService: WebScrapingService) {}


  ngOnInit() {
    this.initializeWebSocket();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.webScrapingService.disconnect();
  }

  private initializeWebSocket() {
    // Connection status
    this.subscriptions.push(
      this.webScrapingService.getConnectionStatus().subscribe(status => {
        this.isConnected = status;
        this.connectionStatus = status ? 'Connected' : 'Disconnected';
        if (status) {
          this.addLog('Connected to scraping server');
          this.loadAvailableProducts();
        } else {
          this.addLog('Disconnected from server');
        }
      })
    );

    // Available products
    this.subscriptions.push(
      this.webScrapingService.getAvailableProducts().subscribe(products => {
        this.availableProducts = products;
        this.selectedProducts = [...products]; // Select all by default
        this.addLog(`Loaded ${products.length} available products`);
      })
    );

    // Scraping started
    this.subscriptions.push(
      this.webScrapingService.onScrapingStarted().subscribe(data => {
        this.isScrapingRunning = true;
        this.scrapingResults = [];
        this.currentResults = [];
        this.totalItemsFound = 0;
        this.stats = {
          totalProducts: data.totalProducts,
          completedProducts: 0,
          totalItems: 0
        };
        this.addLog(`Scraping started for ${data.totalProducts} products`);
      })
    );

    // Progress updates
    this.subscriptions.push(
      this.webScrapingService.onProgress().subscribe(progress => {
        this.scrapingProgress = progress;
        this.addLog(progress.message);
      })
    );

    // Item found
    this.subscriptions.push(
      this.webScrapingService.onItemFound().subscribe(data => {
        this.currentResults.push(data.item);
        this.totalItemsFound++;
        this.stats.totalItems++;
      })
    );

    // Product completed
    this.subscriptions.push(
      this.webScrapingService.onProductComplete().subscribe(data => {
        this.stats.completedProducts++;
        this.addLog(`${data.product}: ${data.count} items found`);
      })
    );

    // Scraping completed
    this.subscriptions.push(
      this.webScrapingService.onScrapingComplete().subscribe(data => {
        this.isScrapingRunning = false;
        this.scrapingResults = data.results;
        // Reset current results first
        this.currentResults = [];

        // Update current results with the latest product's items
        if (this.scrapingResults.length > 0) {
          const lastResult = this.scrapingResults[this.scrapingResults.length - 1];
          this.currentResults = lastResult.items;
        } else {
          this.currentResults = [];
        }


        this.addLog(`Scraping completed! File saved: ${data.fileName}`);
        this.addLog(`Total: ${data.totalProducts} products, ${this.stats.totalItems} items`);
      })
    );

    // Status messages
    this.subscriptions.push(
      this.webScrapingService.onStatus().subscribe(status => {
        this.addLog(`Status: ${status.message}`);
      })
    );

    // Error messages
    this.subscriptions.push(
      this.webScrapingService.onError().subscribe(error => {
        this.addLog(`Error: ${error.message}`, 'error');
      })
    );

    // Connect to server
    this.webScrapingService.connect();
  }

  private loadAvailableProducts() {
    this.webScrapingService.getProductsList();
  }

  startScraping() {
    if (this.selectedProducts.length === 0) {
      this.addLog('Please select at least one product to scrape', 'error');
      return;
    }

    this.addLog(`Starting scraping for ${this.selectedProducts.length} selected products`);
    this.webScrapingService.startScraping(this.selectedProducts);
  }

  stopScraping() {
    this.webScrapingService.stopScraping();
    this.addLog('Stopping scraping...');
  }

  toggleProductSelection(product: string) {
    const index = this.selectedProducts.indexOf(product);
    if (index > -1) {
      this.selectedProducts.splice(index, 1);
    } else {
      this.selectedProducts.push(product);
    }
  }

  selectAllProducts() {
    this.selectedProducts = [...this.availableProducts];
  }

  deselectAllProducts() {
    this.selectedProducts = [];
  }

  isProductSelected(product: string): boolean {
    return this.selectedProducts.includes(product);
  }

  clearactivityLogs() {
    this.activityLogs = [];
  }

  clearResults() {
    this.scrapingResults = [];
    this.currentResults = [];
    this.totalItemsFound = 0;
  }

  private addLog(message: string, type: 'info' | 'error' | 'success' = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    this.activityLogs.unshift(logEntry);

    // Keep only last 100 activityLogs
    if (this.activityLogs.length > 100) {
      this.activityLogs = this.activityLogs.slice(0, 100);
    }
  }

  getProgressPercentage(): number {
    if (this.stats.totalProducts === 0) return 0;
    return Math.round((this.stats.completedProducts / this.stats.totalProducts) * 100);
  }

  reconnect() {
    this.webScrapingService.disconnect();
    setTimeout(() => {
      this.webScrapingService.connect();
    }, 1000);
  }
}
