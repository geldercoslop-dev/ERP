import { ValidationError } from '../_core/errors/typed-errors.js';
const ROLE_PERMISSIONS = {
    admin: ["READ", "WRITE", "DELETE"],
    user: ["READ", "WRITE"],
};
export function checkPermission(user, action) {
    const allowedActions = ROLE_PERMISSIONS[user.role];
    if (!allowedActions.includes(action)) {
        throw new ValidationError("FORBIDDEN");
    }
}
