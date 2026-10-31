// AetherOS - Meteor Weather Application
import React, { useState, useEffect } from 'react';
import type { AppProps } from '../types';
import { Cloud, Sun, CloudRain, Wind, Droplets } from 'lucide-react';

interface WeatherData {
  city: string;
  temp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  forecast: Array<{ day: string; temp: number; icon: string }>;
}

export const WeatherApp: React.FC<AppProps> = () => {
  const [data, setData] = useState<WeatherData>({
    city: 'San Francisco, CA',
    temp: 18,
    condition: 'Partly Cloudy',
    humidity: 64,
    windSpeed: 14,
    forecast: [
      { day: 'Mon', temp: 19, icon: 'sun' },
      { day: 'Tue', temp: 18, icon: 'cloud' },
      { day: 'Wed', temp: 16, icon: 'rain' },
      { day: 'Thu', temp: 17, icon: 'cloud' },
      { day: 'Fri', temp: 20, icon: 'sun' },
    ],
  });

  useEffect(() => {
    // Attempt to fetch real weather from Open-Meteo
    async function fetchWeather() {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=37.77&longitude=-122.42&current=temperature_2m,relative_humidity_2m,wind_speed_10m'
        );
        if (res.ok) {
          const json = await res.json();
          setData((prev) => ({
            ...prev,
            temp: Math.round(json.current.temperature_2m),
            humidity: Math.round(json.current.relative_humidity_2m),
            windSpeed: Math.round(json.current.wind_speed_10m),
          }));
        }
      } catch {
        // Safe offline fallback
      }
    }
    fetchWeather();
  }, []);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#1e293b] to-[#0f172a] text-white p-5 select-none justify-between">
      {/* City & Temp */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">
            Live Meteorology
          </span>
          <span className="text-xs text-gray-400">Open-Meteo Station</span>
        </div>
        <h2 className="text-xl font-bold mt-1 text-white">{data.city}</h2>
        <p className="text-xs text-gray-400">{data.condition}</p>

        <div className="flex items-center gap-4 my-4">
          <div className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
            {data.temp}°C
          </div>
          <Cloud className="w-14 h-14 text-cyan-300 drop-shadow-lg" />
        </div>
      </div>

      {/* Atmospheric Stats */}
      <div className="grid grid-cols-2 gap-3 my-2">
        <div className="bg-[#1e293b]/70 border border-gray-700/60 p-3 rounded-xl flex items-center gap-3">
          <Droplets className="w-5 h-5 text-cyan-400" />
          <div>
            <span className="text-[10px] text-gray-400 block uppercase">Humidity</span>
            <span className="text-sm font-bold text-white">{data.humidity}%</span>
          </div>
        </div>

        <div className="bg-[#1e293b]/70 border border-gray-700/60 p-3 rounded-xl flex items-center gap-3">
          <Wind className="w-5 h-5 text-cyan-400" />
          <div>
            <span className="text-[10px] text-gray-400 block uppercase">Wind Speed</span>
            <span className="text-sm font-bold text-white">{data.windSpeed} km/h</span>
          </div>
        </div>
      </div>

      {/* 5-Day Forecast Strip */}
      <div className="bg-[#1e293b]/50 border border-gray-700/60 p-3 rounded-xl">
        <span className="text-[10px] text-gray-400 uppercase font-semibold block mb-2">
          5-Day Forecast
        </span>
        <div className="flex justify-between items-center text-xs">
          {data.forecast.map((f, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-gray-400 text-[11px]">{f.day}</span>
              {f.icon === 'sun' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : f.icon === 'rain' ? (
                <CloudRain className="w-4 h-4 text-cyan-400" />
              ) : (
                <Cloud className="w-4 h-4 text-blue-300" />
              )}
              <span className="font-semibold text-white">{f.temp}°</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
