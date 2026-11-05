import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';

export interface Subscriber {
  id: string;
  name: string;
  phone: string;
  tags: string[];
  optedIn: boolean;
  ownerUid: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type SubscriberInput = Pick<Subscriber, 'name' | 'phone' | 'tags' | 'optedIn'>;

@Injectable({ providedIn: 'root' })
export class SubscribersService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly subscribers = collection(this.firestore, 'subscribers');

  async list(): Promise<Subscriber[]> {
    const uid = this.currentUid();
    const snapshot = await getDocs(query(this.subscribers, where('ownerUid', '==', uid)));
    return snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }) as Subscriber)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async add(input: SubscriberInput): Promise<void> {
    const ownerUid = this.currentUid();
    await this.assertPhoneAvailable(input.phone, ownerUid);
    await addDoc(this.subscribers, {
      ...this.cleanInput(input),
      ownerUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async update(id: string, input: SubscriberInput): Promise<void> {
    const ownerUid = this.currentUid();
    await this.assertPhoneAvailable(input.phone, ownerUid, id);
    await updateDoc(doc(this.firestore, 'subscribers', id), {
      ...this.cleanInput(input),
      ownerUid,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    this.currentUid();
    await deleteDoc(doc(this.firestore, 'subscribers', id));
  }

  private async assertPhoneAvailable(phone: string, ownerUid: string, exceptId?: string) {
    const matches = await getDocs(query(
      this.subscribers,
      where('ownerUid', '==', ownerUid),
      where('phone', '==', phone),
    ));
    if (matches.docs.some(item => item.id !== exceptId)) {
      throw new Error('A subscriber with this phone number already exists.');
    }
  }

  private cleanInput(input: SubscriberInput): SubscriberInput {
    return {
      name: input.name.trim(),
      phone: input.phone.trim(),
      tags: [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))],
      optedIn: input.optedIn,
    };
  }

  private currentUid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in to manage subscribers.');
    return uid;
  }
}
