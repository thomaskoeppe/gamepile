interface BaseUser {
  id: string;
  steamId: string;
  username: string;
  avatarUrl: string | null;
}

export interface VaultMember extends BaseUser {
  isOwner: true;
}

export interface VaultNonOwnerMember extends BaseUser {
  isOwner: false;
  canRedeem: boolean;
  canCreate: boolean;
  addedBy: BaseUser;
  addedAt: Date;
  keyVaultUserId?: string;
}

export interface CollectionMember extends BaseUser {
  isOwner: true;
}

export interface CollectionNonOwnerMember extends BaseUser {
  isOwner: false;
  canModify: boolean;
  addedBy: BaseUser;
  addedAt: Date;
  collectionUserId?: string;
}

export type MemberUser = VaultMember | VaultNonOwnerMember | CollectionMember | CollectionNonOwnerMember;

export type ResourceType = "vault" | "collection";

