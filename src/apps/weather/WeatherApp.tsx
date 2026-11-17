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

const CITIES: Record<string, { lat: number; lon: number }> = {
  'San Francisco, CA': { lat: 37.77, lon: -122.42 },
  'New York, NY': { lat: 40.71, lon: -74.01 },
  'London, UK': { lat: 51.51, lon: -0.13 },
  'Tokyo, Japan': { lat: 35.68, lon: 139.69 },
  'Paris, France': { lat: 48.85, lon: 2.35 },
  'Sydney, Australia': { lat: -33.87, lon: 151.21 },
};

export const WeatherApp: React.FC<AppProps> = () => {
  const [selectedCity, setSelectedCity] = useState('San Francisco, CA');
  const [isLoading, setIsLoading] = useState(false);
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
    const controller = new AbortController();
    const coords = CITIES[selectedCity] || CITIES['San Francisco, CA'];

    async function fetchWeather() {
      setIsLoading(true);
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const json = await res.json();
          setData((prev) => ({
            ...prev,
            city: selectedCity,
            temp: Math.round(json.current.temperature_2m),
            humidity: Math.round(json.current.relative_humidity_2m),
            windSpeed: Math.round(json.current.wind_speed_10m),
          }));
        }
      } catch {
        // Safe offline fallback
      } finally {
        setIsLoading(false);
      }
    }
    fetchWeather();
    return () => controller.abort();
  }, [selectedCity]);

  return (
    <div className="weather-app flex flex-col h-full bg-canvas text-ink p-5 select-none justify-between overflow-auto">
      {/* City & Temp */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-secondary font-semibold">
            Location
          </span>
          <select
            aria-label="Forecast location"
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="bg-raised border border-line text-xs text-ink rounded px-2 py-1 outline-none cursor-pointer"
          >
            {Object.keys(CITIES).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink">{data.city}</h2>
            <p className="text-xs text-muted">
              {isLoading ? 'Updating station data...' : data.condition}
            </p>
          </div>
          <span className="text-[10px] text-muted font-mono">Open-Meteo</span>
        </div>

        <div className="flex items-center gap-4 my-4">
          <div className="weather-temperature">
            {data.temp}°C
          </div>
          <Cloud className="w-12 h-12 text-accent" />
        </div>
      </div>

      {/* Atmospheric Stats */}
      <div className="grid grid-cols-2 gap-3 my-2">
        <div className="bg-raised border border-line p-3 rounded-xl flex items-center gap-3">
          <Droplets className="w-5 h-5 text-accent" />
          <div>
            <span className="text-[10px] text-muted block">Humidity</span>
            <span className="text-sm font-bold text-ink">{data.humidity}%</span>
          </div>
        </div>

        <div className="bg-raised border border-line p-3 rounded-xl flex items-center gap-3">
          <Wind className="w-5 h-5 text-accent" />
          <div>
            <span className="text-[10px] text-muted block">Wind Speed</span>
            <span className="text-sm font-bold text-ink">{data.windSpeed} km/h</span>
          </div>
        </div>
      </div>

      {/* 5-Day Forecast Strip */}
      <div className="bg-raised border border-line p-3 rounded-xl">
        <span className="text-xs text-muted font-semibold block mb-2">
          5-Day Forecast
        </span>
        <div className="flex justify-between items-center text-xs">
          {data.forecast.map((f, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-muted text-[11px]">{f.day}</span>
              {f.icon === 'sun' ? (
                <Sun className="w-4 h-4 text-caution" />
              ) : f.icon === 'rain' ? (
                <CloudRain className="w-4 h-4 text-accent" />
              ) : (
                <Cloud className="w-4 h-4 text-accent" />
              )}
              <span className="font-semibold text-ink">{f.temp}°</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
