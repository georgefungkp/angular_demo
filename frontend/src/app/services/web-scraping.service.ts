import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, BehaviorSubject } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class WebScrapingService {
  private socket: Socket | null = null;
  private serverUrl = 'http://localhost:3000';

  // Subjects for different events
  private connectionStatus = new BehaviorSubject<boolean>(false);
  private availableProducts = new Subject<string[]>();
  private scrapingStarted = new Subject<any>();
  private progress = new Subject<any>();
  private itemFound = new Subject<any>();
  private productComplete = new Subject<any>();
  private scrapingComplete = new Subject<any>();
  private status = new Subject<any>();
  private error = new Subject<any>();

  constructor(private ngZone: NgZone) {}

  connect() {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(this.serverUrl, {
      transports: ['websocket'],
      upgrade: false
    });

    this.socket.on('connect', () => {
      this.ngZone.run(() => {
        console.log('Connected to WebSocket server');
        this.connectionStatus.next(true);
      });
    });

    this.socket.on('disconnect', () => {
      this.ngZone.run(() => {
        console.log('Disconnected from WebSocket server');
        this.connectionStatus.next(false);
      });
    });

    this.socket.on('connected', (data) => {
      this.ngZone.run(() => {
        console.log(data.message);
        console.log('Server connection confirmed:', data);
        this.availableProducts.next(data.availableProducts);
      });
    });

    this.socket.on('products_list', (data) => {
      this.ngZone.run(() => {
        console.log('Received products list:', data);
        this.availableProducts.next(data.products);
      });
    });

    this.socket.on('scraping_started', (data) => {
      this.ngZone.run(() => {
        console.log('Scraping started:', data);
        this.scrapingStarted.next(data);
      });
    });

    this.socket.on('progress', (data) => {
      this.ngZone.run(() => {
        console.log('Progress update:', data);
        this.progress.next(data);
      });
    });

    this.socket.on('item_found', (data) => {
      this.ngZone.run(() => {
        console.log('Item found:', data);
        this.itemFound.next(data);
      });
    });

    this.socket.on('product_complete', (data) => {
      this.ngZone.run(() => {
        console.log('Product complete:', data);
        this.productComplete.next(data);
      });
    });

    this.socket.on('scraping_complete', (data) => {
      this.ngZone.run(() => {
        console.log('Scraping complete:', data);
        this.scrapingComplete.next(data);
      });
    });

    this.socket.on('status', (data) => {
      this.ngZone.run(() => {
        console.log('Status update:', data);
        this.status.next(data);
      });
    });

    this.socket.on('error', (data) => {
      this.ngZone.run(() => {
        console.error('Server error:', data);
        this.error.next(data);
      });
    });

    this.socket.on('connect_error', (error) => {
      this.ngZone.run(() => {
        console.error('Connection error:', error);
        this.connectionStatus.next(false);
        this.error.next({ message: 'Failed to connect to server', type: 'error' });
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionStatus.next(false);
  }

  startScraping(selectedProducts?: string[]) {
    if (this.socket?.connected) {
      this.socket.emit('start_scraping', { selectedProducts });
    } else {
      this.error.next({ message: 'Not connected to server', type: 'error' });
    }
  }

  stopScraping() {
    if (this.socket?.connected) {
      this.socket.emit('stop_scraping');
    }
  }

  getProductsList() {
    if (this.socket?.connected) {
      this.socket.emit('get_products');
    }
  }

  // Observable getters
  getConnectionStatus(): Observable<boolean> {
    return this.connectionStatus.asObservable();
  }

  getAvailableProducts(): Observable<string[]> {
    return this.availableProducts.asObservable();
  }

  onScrapingStarted(): Observable<any> {
    return this.scrapingStarted.asObservable();
  }

  onProgress(): Observable<any> {
    return this.progress.asObservable();
  }

  onItemFound(): Observable<any> {
    return this.itemFound.asObservable();
  }

  onProductComplete(): Observable<any> {
    return this.productComplete.asObservable();
  }

  onScrapingComplete(): Observable<any> {
    return this.scrapingComplete.asObservable();
  }

  onStatus(): Observable<any> {
    return this.status.asObservable();
  }

  onError(): Observable<any> {
    return this.error.asObservable();
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}
