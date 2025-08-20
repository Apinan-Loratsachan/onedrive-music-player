"use client";

import { useState } from "react";
import { LogIn, Music } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Divider } from "@heroui/react";
import { signIn } from "next-auth/react";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await signIn("azure-ad", { callbackUrl: "/" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="shadow-xl">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
              <Music className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              OneDrive Music Player
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Access and play your music from OneDrive
            </p>
          </CardHeader>

          <CardBody className="space-y-4">
            <Button
              onClick={handleLogin}
              isLoading={isLoading}
              color="primary"
              size="lg"
              className="w-full"
              startContent={!isLoading && <LogIn className="w-5 h-5" />}
            >
              {isLoading ? "Connecting..." : "Sign in with Microsoft"}
            </Button>

            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You'll be redirected to Microsoft to sign in securely
              </p>
            </div>

            <Divider />

            <div className="text-center">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                Features
              </h3>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li>• Stream music directly from OneDrive</li>
                <li>• Full music player controls</li>
                <li>• Secure Microsoft authentication</li>
                <li>• Responsive design for all devices</li>
              </ul>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
