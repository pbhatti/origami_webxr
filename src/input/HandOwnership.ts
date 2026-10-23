export type HandId = 'left' | 'right';

export class HandOwnership {
  private foldOwner: HandId | null = null;
  private holdOwner: HandId | null = null;
  private moveOwner: HandId | null = null;
  private moveSecondaryOwner: HandId | null = null;

  get fold(): HandId | null {
    return this.foldOwner;
  }

  get hold(): HandId | null {
    return this.holdOwner;
  }

  get move(): HandId | null {
    return this.moveOwner;
  }

  get moveSecondary(): HandId | null {
    return this.moveSecondaryOwner;
  }

  tryClaimFold(hand: HandId): boolean {
    if (this.moveOwner != null) {
      return false;
    }
    if (this.foldOwner == null) {
      this.foldOwner = hand;
      return true;
    }
    return this.foldOwner === hand;
  }

  tryClaimMove(hand: HandId): boolean {
    if (this.foldOwner != null) {
      return false;
    }
    if (this.moveOwner == null) {
      this.moveOwner = hand;
      return true;
    }
    return this.moveOwner === hand;
  }

  tryClaimMoveSecondary(hand: HandId): boolean {
    if (this.moveOwner == null || this.moveOwner === hand || this.foldOwner != null) {
      return false;
    }
    if (this.moveSecondaryOwner == null) {
      this.moveSecondaryOwner = hand;
      return true;
    }
    return this.moveSecondaryOwner === hand;
  }

  tryClaimHold(hand: HandId): boolean {
    if (this.moveOwner != null) {
      return false;
    }
    if (this.foldOwner === hand) {
      return false;
    }
    if (this.holdOwner == null) {
      this.holdOwner = hand;
      return true;
    }
    return this.holdOwner === hand;
  }

  releaseFold(hand: HandId): void {
    if (this.foldOwner === hand) {
      this.foldOwner = null;
    }
  }

  releaseHold(hand: HandId): void {
    if (this.holdOwner === hand) {
      this.holdOwner = null;
    }
  }

  release(hand: HandId): void {
    this.releaseFold(hand);
    this.releaseHold(hand);
    this.releaseMove(hand);
  }

  releaseMove(hand: HandId): void {
    if (this.moveSecondaryOwner === hand) {
      this.moveSecondaryOwner = null;
    }
    if (this.moveOwner === hand) {
      this.moveOwner = this.moveSecondaryOwner;
      this.moveSecondaryOwner = null;
    }
  }

  reset(): void {
    this.foldOwner = null;
    this.holdOwner = null;
    this.moveOwner = null;
    this.moveSecondaryOwner = null;
  }
}
