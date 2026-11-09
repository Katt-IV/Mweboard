import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Auth,
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
  updatePassword,
} from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);

  constructor() {
    if (this.isBrowser) {
      onAuthStateChanged(this.auth, user => {
        this.user.set(user);
        this.ready.set(true);
      });
    } else {
      this.ready.set(true);
    }
  }

  signInWithGoogle() {
    return signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  signUpWithEmail(email: string, password: string) {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  signInWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  signOut() {
    return signOut(this.auth);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.requireCurrentUser();
    if (!user.email || !user.providerData.some(provider => provider.providerId === 'password')) {
      throw new Error('Password changes are available only for email and password accounts.');
    }
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
  }

  async reauthenticateForAccountDeletion(password: string): Promise<string> {
    const user = this.requireCurrentUser();
    if (user.providerData.some(provider => provider.providerId === 'password')) {
      if (!user.email || !password) throw new Error('Enter your current password to delete this account.');
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else if (user.providerData.some(provider => provider.providerId === 'google.com')) {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    } else {
      throw new Error('This sign-in method cannot be reauthenticated in the app. Contact support to delete this account.');
    }
    return user.getIdToken(true);
  }

  private requireCurrentUser(): User {
    const user = this.auth.currentUser;
    if (!user) throw new Error('You are signed out. Sign in again and retry.');
    return user;
  }
}
