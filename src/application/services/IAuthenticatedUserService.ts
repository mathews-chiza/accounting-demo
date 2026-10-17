export default interface IAuthenticatedUserService {
  isAdmin(): boolean;
  isAccountant(): boolean;
  hasPermission(permission: string): boolean;
}
