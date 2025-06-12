import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebScrapingService } from './services/web-scraping.service';
import { Observable, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Web Scraping Dashboard by George Fung';

  // Connection state
  isConnected = false;
  connectionStatus = 'Disconnected';

  // Product selection
  availableProducts: string[] = [];
  selectedProducts: string[] = [];

  // Scraping state
  isScrapingRunning = false;
  isScrapingActive = false;
  scrapingProgress: any = { message: 'Ready to start...' };
  currentItem: any = null;
  totalItemsFound = 0;

  // Results
  currentResults: any[] = [];
  scrapingResults: any[] = [];

  // Logs
  activityLogs: string[] = [];

  // Statistics
  stats = {
    completedProducts: 0,
    totalProducts: 0,
    totalItems: 0
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private webScrapingService: WebScrapingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.connectToServer();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.webScrapingService.disconnect();
  }

  // Helper method to subscribe with automatic change detection
  private subscribeWithDetection<T>(
    observable: Observable<T>,
    handler: (data: T) => void
  ): void {
    this.subscriptions.push(
      observable.subscribe(data => {
        handler(data);
        this.cdr.detectChanges(); // Automatically added to every subscription
      })
    );
  }

  private connectToServer() {
    this.addLog('Attempting to connect to server...');
    this.webScrapingService.connect();
    this.initializeWebSocket();
  }

  private initializeWebSocket() {
    // Connection status
    this.subscribeWithDetection(
      this.webScrapingService.getConnectionStatus(),
      (status) => {
        this.isConnected = status;
        this.connectionStatus = status ? 'Connected' : 'Disconnected';
        if (status) {
          this.addLog('Connected to scraping server');
          this.loadAvailableProducts();
        } else {
          this.addLog('Disconnected from server');
        }
      }
    );

    // Available products
    this.subscribeWithDetection(
      this.webScrapingService.getAvailableProducts(),
      (products) => {
        this.availableProducts = products;
        this.selectedProducts = [...products];
        this.addLog(`Loaded ${products.length} available products`);
      }
    );

    // Scraping started
    this.subscribeWithDetection(
      this.webScrapingService.onScrapingStarted(),
      (data) => {
        this.isScrapingRunning = true;
        this.isScrapingActive = true;
        this.currentResults = [];
        this.stats.totalProducts = data.totalProducts;
        this.stats.completedProducts = 0;
        this.stats.totalItems = 0;
        this.addLog(`Scraping started for ${data.totalProducts} products`);
      }
    );

    // Progress updates
    this.subscribeWithDetection(
      this.webScrapingService.onProgress(),
      (progress) => {
        this.scrapingProgress = progress;
        this.addLog(progress.message);
      }
    );

    // Item found
    this.subscribeWithDetection(
      this.webScrapingService.onItemFound(),
      (data) => {
        this.currentItem = data.item;
        this.totalItemsFound = data.total;
        this.currentResults.push(data.item);
        this.stats.totalItems++;
        this.addLog(`Found item: ${data.item.name} - ${data.item.price}`);
      }
    );

    // Product complete
    this.subscribeWithDetection(
      this.webScrapingService.onProductComplete(),
      (data) => {
        this.stats.completedProducts++;
        this.addLog(`${data.product} completed: ${data.count} items found`);
      }
    );

    // Scraping complete
    this.subscribeWithDetection(
      this.webScrapingService.onScrapingComplete(),
      (data) => {
        this.scrapingResults = data.results;
        this.isScrapingActive = false;
        this.isScrapingRunning = false;
        this.addLog(`Scraping completed! File: ${data.fileName}`);
      }
    );

    // Status updates
    this.subscribeWithDetection(
      this.webScrapingService.onStatus(),
      (status) => {
        this.addLog(status.message, status.type);
      }
    );

    // Error handling
    this.subscribeWithDetection(
      this.webScrapingService.onError(),
      (error) => {
        this.addLog(`Error: ${error.message}`, 'error');
        this.isScrapingActive = false;
        this.isScrapingRunning = false;
      }
    );
  }

  private addLog(message: string, type: 'info' | 'error' | 'success' = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;

    // Create new array reference
    this.activityLogs = [logEntry, ...this.activityLogs];

    // Keep only last 100 logs
    if (this.activityLogs.length > 100) {
      this.activityLogs = this.activityLogs.slice(0, 100);
    }
  }

  private loadAvailableProducts() {
    this.webScrapingService.getProductsList();
  }

  // Public methods for UI
  reconnect() {
    this.webScrapingService.disconnect();
    setTimeout(() => {
      this.connectToServer();
    }, 1000);
  }

  startScraping() {
    if (this.selectedProducts.length === 0) {
      this.addLog('No products selected for scraping', 'error');
      return;
    }

    this.addLog(`Starting scraping for ${this.selectedProducts.length} products...`);
    this.webScrapingService.startScraping(this.selectedProducts);
  }

  stopScraping() {
    this.addLog('Stopping scraping...');
    this.webScrapingService.stopScraping();
    this.isScrapingRunning = false;
    this.isScrapingActive = false;
  }

  selectAllProducts() {
    this.selectedProducts = [...this.availableProducts];
    this.addLog('All products selected');
  }

  deselectAllProducts() {
    this.selectedProducts = [];
    this.addLog('All products deselected');
  }

  toggleProductSelection(product: string) {
    const index = this.selectedProducts.indexOf(product);
    if (index > -1) {
      this.selectedProducts.splice(index, 1);
    } else {
      this.selectedProducts.push(product);
    }
  }

  isProductSelected(product: string): boolean {
    return this.selectedProducts.includes(product);
  }

  getProgressPercentage(): number {
    if (this.stats.totalProducts === 0) return 0;
    return Math.round((this.stats.completedProducts / this.stats.totalProducts) * 100);
  }

  clearactivityLogs() {
    this.activityLogs = [];
    this.addLog('Activity logs cleared');
  }

  clearResults() {
    this.currentResults = [];
    this.scrapingResults = [];
    this.stats = {
      completedProducts: 0,
      totalProducts: 0,
      totalItems: 0
    };
    this.addLog('Results cleared');
  }
}
