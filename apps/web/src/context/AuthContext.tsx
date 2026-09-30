import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

const USERS_KEY = 'stayhub_users';
const SESSION_KEY = 'stayhub_session';

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => AuthResult;
  register: (name: string, email: string, password: string) => AuthResult;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const sessionId = localStorage.getItem(SESSION_KEY);
      if (!sessionId) return null;
      const users: User[] = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      return users.find((u) => u.id === sessionId) ?? null;
    } catch {
      return null;
    }
  });

  const getUsers = (): User[] => {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    } catch {
      return [];
    }
  };

  const saveUsers = (users: User[]) => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  };

  const login = (email: string, password: string): AuthResult => {
    const users = getUsers();
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!user) {
      return { success: false, error: 'Correo o contraseña incorrectos' };
    }
    localStorage.setItem(SESSION_KEY, user.id);
    setCurrentUser(user);
    return { success: true };
  };

  const register = (name: string, email: string, password: string): AuthResult => {
    const users = getUsers();
    const exists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      return { success: false, error: 'Este correo ya está registrado' };
    }
    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
    };
    saveUsers([...users, newUser]);
    localStorage.setItem(SESSION_KEY, newUser.id);
    setCurrentUser(newUser);
    return { success: true };
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
