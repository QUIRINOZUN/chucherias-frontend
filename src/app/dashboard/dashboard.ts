import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.html',
})
export class DashboardComponent {
  constructor(public authService: AuthService) {}
}
