import withPWA from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // Sadece Supabase'den gelen JSON verilerini (Antrenman/Profil) cache'le
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/(workout_logs|profiles).*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offline-workout-data',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 1 Hafta hafızada tut
        },
      },
    },
    {
      // Form fotoğraflarını cihazda TUTMA (Hafıza dostu)
      urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public.*/i,
      handler: 'NetworkOnly', 
    }
  ]
})(nextConfig);