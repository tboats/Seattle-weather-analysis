# Seattle Weather & Daylight Thermal Lag Analysis 🌤️🌡️

An interactive web visualization exploring **Seattle, Washington** weather observations over the past year (August 2025 – August 2026), compared against **10-year historical climate normals (2015–2025)**, solar daylight duration, thermal lag, and precipitation volatility.

---

## 🌟 Key Features

1. **1-Year Temperature Time Series**:
   - Continuous 10-year historical average high & low temperature baseline curves.
   - Interactive 7-day rolling average toggle (°F / °C).
   - Daily observed temperature scatter points.
2. **Month-by-Month & Seasonal Anomaly Analysis**:
   - Seasonal breakdown showing **Winter (+3.66°F Lows)** and **Spring (+2.37°F Lows)** as the strongest warming periods, while **Summer (+0.66°F Highs)** remained near normal.
   - Distinct High/Low monthly anomaly bar chart (Sunburst Gold vs. Electric Violet).
3. **Precipitation & Volatility Analysis**:
   - Total observed rainfall (**45.33 in** vs. **46.68 in normal**, -2.9% deficit).
   - Daily rainfall volatility ($\sigma = 0.235\text{ in/day}$ vs typical $\sigma = 0.177\text{ in/day}$, **+32.8% spread**).
   - **+18.9% more heavy rain days** ($\ge 0.50\text{ in}$) separated by longer dry stretches.
4. **Sun Up Time vs. Average Temperature (Thermal Lag Exploration)**:
   - Quantifies the **34-day empirical thermal lag** ($r = 0.9808$) between peak solar daylight duration (Summer Solstice, June 21) and peak mean temperature (July 25).
   - Interactive lag slider offset ($0$ to $60$ days) with live cross-correlation updates.
5. **Cross-Correlation Spectrum $R(\tau)$ & Seasonal Hysteresis Loop**.

---

## 🛠️ Technology Stack

- **HTML5 & Vanilla CSS3**: Dark mode UI with HSL glowing accents and glassmorphism cards.
- **JavaScript (ES6+)**: Custom statistical processing & dual-mode data loading (`weather_data.js` preloader for offline/file resilience).
- **Chart.js v4**: Modular, responsive canvas chart rendering engine.
- **Python 3 & Open-Meteo Historical Weather API**: Data pipeline querying historical climate normals and observations.

---

## 🚀 Local Setup & Running

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/Seattle-weather-analysis.git
   cd Seattle-weather-analysis
   ```

2. **Serve locally**:
   ```bash
   python3 -m http.server 8080
   ```
   Open **[http://localhost:8080](http://localhost:8080)** in your browser!

3. **(Optional) Re-fetch & Update Data**:
   ```bash
   python3 scripts/fetch_data.py
   ```

---

## 📄 License
MIT License
