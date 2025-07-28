import { Roles } from "./strings";

/*
DEPRECATED
*/

/**
 * @param user - The user to check the permission for
 * @returns true if the user is a lead. false otherwise
 * @deprecated use requireLeadRole instead
 */

export function isLead(user: any): boolean {
    if (!user) return false;
    if (!user.role) return false;

    if (user.role === Roles.LEAD) return true;

    return false;
}

/**
 * @param user - The user to check the permission for
 * @returns true if the user is a member. false otherwise
 * @deprecated use requireMemberRole instead
 */
export function isMember(user: any): boolean {
    if (!user) return false;
    if (!user.role) return false;

    // there is nothing which members can do which leads can't
    if (user.role === Roles.MEMBER || user.role === Roles.LEAD) return true;

    return false;
}

/**
 * @param user - The user to check the permission for
 * @returns true if the user is a member and not a lead. false otherwise
 * @deprecated not required; there is nothing which members can do which leads can't
 */
export function isOnlyMember(user: any): boolean {
    if (!user) return false;
    if (!user.role) return false;

    if (user.role === Roles.MEMBER) return true;
    return false;
}

/**
 * @param user - The user to check the permission for
 * @returns true if the user has permission, false otherwise. meant to be a duplicate of isMember, but with a more descriptive name
 * @deprecated use requireMemberRole instead
 */
export function hasPermission(user: any): boolean {
    return isMember(user);
}
