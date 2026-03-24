export type AuthLog = {
  username: string;
  success: boolean;
  ip: string;
  timestamp: number;
};

export function logAuth(data: AuthLog): void {
  console.log("[AUTH]", JSON.stringify(data));
}

