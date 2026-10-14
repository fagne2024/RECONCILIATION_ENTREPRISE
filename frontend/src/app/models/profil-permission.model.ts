import { Profil } from './profil.model';
import { Module } from './module.model';
import { Permission } from './permission.model';

export interface ProfilPermission {
  id?: number;
  profil: Profil;
  module: Module;
  permission: Permission;
} 