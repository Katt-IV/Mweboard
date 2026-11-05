import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { from, switchMap } from 'rxjs';
import { environment } from '../environments/environment';

export const firebaseTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const baseUrl = new URL(environment.apiBaseUrl);
  const requestUrl = new URL(request.url, baseUrl);
  const isApiRequest = requestUrl.origin === baseUrl.origin
    && requestUrl.pathname.startsWith(`${baseUrl.pathname.replace(/\/$/, '')}/`);

  if (!isApiRequest) return next(request);

  const user = inject(Auth).currentUser;
  if (!user) return next(request);

  return from(user.getIdToken()).pipe(
    switchMap(token => next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))),
  );
};
