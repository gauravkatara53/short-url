import * as UserModel from '../models/user.model.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
import type { SafeUser } from '../types/index.js';

/**
 * Register a new user.
 * Returns safe user data (no password hash).
 */
export async function register(
  name: string,
  email: string,
  password: string,
): Promise<SafeUser> {
  // Check for duplicate email
  const existing = await UserModel.findByEmail(email);
  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await UserModel.create(name, email, passwordHash);
  return UserModel.toSafeUser(user);
}

/**
 * Login a user.
 * Returns safe user data + JWT.
 */
export async function login(
  email: string,
  password: string,
): Promise<{ user: SafeUser; token: string }> {
  const user = await UserModel.findByEmail(email);
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await comparePassword(password, user.password_hash);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  const token = signToken({ id: user.id, email: user.email });
  return { user: UserModel.toSafeUser(user), token };
}
