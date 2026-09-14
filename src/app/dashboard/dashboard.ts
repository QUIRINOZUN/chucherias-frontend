import { Component } from '@angular/core';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
})
export class DashboardComponent {
  constructor(public authService: AuthService) {}
}
