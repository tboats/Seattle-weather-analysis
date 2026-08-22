import urllib.request
import json
import os
from datetime import datetime, timedelta
from collections import defaultdict
import math

def fetch_seattle_weather():
    print("Fetching historical climate data (2015-2025) for Seattle, WA...")
    lat, lon = 47.6062, -122.3321
    
    # 1. Fetch 10-year historical climate data for baseline averages (temp & precip)
    hist_url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}&"
        f"start_date=2015-01-01&end_date=2025-12-31&"
        f"daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,daylight_duration,precipitation_sum&"
        f"temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FLos_Angeles"
    )
    
    req = urllib.request.Request(hist_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        hist_raw = json.loads(resp.read().decode())

    hist_daily = hist_raw['daily']
    by_mmdd = defaultdict(lambda: {'max': [], 'min': [], 'mean': [], 'daylight': [], 'precip': []})
    all_hist_precip = []
    hist_annual_maxes = defaultdict(list)
    
    for t, h, l, m, d, pr in zip(
        hist_daily['time'],
        hist_daily['temperature_2m_max'],
        hist_daily['temperature_2m_min'],
        hist_daily['temperature_2m_mean'],
        hist_daily['daylight_duration'],
        hist_daily['precipitation_sum']
    ):
        mmdd = t[5:] # MM-DD
        year = t[:4]
        if h is not None: by_mmdd[mmdd]['max'].append(h)
        if l is not None: by_mmdd[mmdd]['min'].append(l)
        if m is not None: by_mmdd[mmdd]['mean'].append(m)
        if d is not None: by_mmdd[mmdd]['daylight'].append(d / 3600.0)
        if pr is not None: 
            by_mmdd[mmdd]['precip'].append(pr)
            all_hist_precip.append(pr)
            hist_annual_maxes[year].append(pr)

    def std_dev(lst):
        if not lst or len(lst) < 2: return 0.0
        m = sum(lst) / len(lst)
        return math.sqrt(sum((x - m)**2 for x in lst) / len(lst))

    climate_normals = {}
    hist_std_highs = []
    hist_std_lows = []
    hist_std_precip = []

    for mmdd, vals in sorted(by_mmdd.items()):
        s_h = std_dev(vals['max']) if vals['max'] else 0.0
        s_l = std_dev(vals['min']) if vals['min'] else 0.0
        s_p = std_dev(vals['precip']) if vals['precip'] else 0.0

        if vals['max']: hist_std_highs.append(s_h)
        if vals['min']: hist_std_lows.append(s_l)
        if vals['precip']: hist_std_precip.append(s_p)

        climate_normals[mmdd] = {
            'avg_high': round(sum(vals['max']) / len(vals['max']), 1) if vals['max'] else None,
            'avg_low': round(sum(vals['min']) / len(vals['min']), 1) if vals['min'] else None,
            'avg_mean': round(sum(vals['mean']) / len(vals['mean']), 1) if vals['mean'] else None,
            'avg_daylight_hrs': round(sum(vals['daylight']) / len(vals['daylight']), 2) if vals['daylight'] else None,
            'avg_precip_in': round(sum(vals['precip']) / len(vals['precip']), 3) if vals['precip'] else 0.0,
            'std_high': round(s_h, 2),
            'std_low': round(s_l, 2),
            'std_precip': round(s_p, 3)
        }

    typical_hist_std_high = round(sum(hist_std_highs) / len(hist_std_highs), 2) if hist_std_highs else 5.1
    typical_hist_std_low = round(sum(hist_std_lows) / len(hist_std_lows), 2) if hist_std_lows else 3.9
    typical_hist_std_precip = round(sum(hist_std_precip) / len(hist_std_precip), 3) if hist_std_precip else 0.177

    annual_max_events = [max(p_list) for p_list in hist_annual_maxes.values() if p_list]
    typical_hist_annual_max_event = round(sum(annual_max_events) / len(annual_max_events), 2) if annual_max_events else 1.75
    typical_hist_wet_days = round(sum(1 for p in all_hist_precip if p >= 0.01) / len(hist_annual_maxes), 1) if hist_annual_maxes else 182.4
    typical_hist_heavy_days = round(sum(1 for p in all_hist_precip if p >= 0.50) / len(hist_annual_maxes), 1) if hist_annual_maxes else 28.6

    # 2. Fetch past 1 year daily observed weather data (Archive + Recent Forecast API for real-time completeness)
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=365)
    start_str = start_dt.strftime('%Y-%m-%d')
    end_str = end_dt.strftime('%Y-%m-%d')

    print(f"Fetching 1-year observed daily weather archive ({start_str} to {end_str})...")
    obs_url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}&"
        f"start_date={start_str}&end_date={end_str}&"
        f"daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,daylight_duration,sunrise,sunset,precipitation_sum&"
        f"temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FLos_Angeles"
    )
    
    req_obs = urllib.request.Request(obs_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req_obs) as resp:
        obs_raw = json.loads(resp.read().decode())

    obs_daily = obs_raw['daily']
    obs_map = {}
    
    for t, h, l, m, d, sr, ss, pr in zip(
        obs_daily['time'],
        obs_daily['temperature_2m_max'],
        obs_daily['temperature_2m_min'],
        obs_daily['temperature_2m_mean'],
        obs_daily['daylight_duration'],
        obs_daily['sunrise'],
        obs_daily['sunset'],
        obs_daily['precipitation_sum']
    ):
        obs_map[t] = {
            'h': h, 'l': l, 'm': m, 'd': d, 'sr': sr, 'ss': ss, 'pr': pr
        }

    # Fetch recent days from Forecast API to overwrite any missing or outdated recent days up to today
    print("Fetching recent real-time observations to guarantee full 365-day dataset up to today...")
    recent_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&"
        f"daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,daylight_duration,sunrise,sunset,precipitation_sum&"
        f"past_days=14&forecast_days=1&"
        f"temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FLos_Angeles"
    )
    try:
        req_rec = urllib.request.Request(recent_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_rec) as resp:
            rec_raw = json.loads(resp.read().decode())
        rec_daily = rec_raw['daily']
        for t, h, l, m, d, sr, ss, pr in zip(
            rec_daily['time'],
            rec_daily['temperature_2m_max'],
            rec_daily['temperature_2m_min'],
            rec_daily['temperature_2m_mean'],
            rec_daily['daylight_duration'],
            rec_daily['sunrise'],
            rec_daily['sunset'],
            rec_daily['precipitation_sum']
        ):
            if h is not None or t not in obs_map:
                obs_map[t] = {
                    'h': h, 'l': l, 'm': m, 'd': d, 'sr': sr, 'ss': ss, 'pr': pr
                }
    except Exception as e:
        print("Warning: could not fetch recent forecast API data:", e)

    sorted_times = sorted(obs_map.keys())[-365:]
    observations = []
    cum_obs_pr = 0.0
    cum_norm_pr = 0.0
    by_month_data = defaultdict(lambda: {'h_obs': [], 'h_avg': [], 'l_obs': [], 'l_avg': [], 'm_obs': [], 'm_avg': []})

    for t in sorted_times:
        item = obs_map[t]
        h, l, m, d, sr, ss, pr = item['h'], item['l'], item['m'], item['d'], item['sr'], item['ss'], item['pr']
        mmdd = t[5:]
        m_key = t[:7] # YYYY-MM
        normal = climate_normals.get(mmdd, {
            'avg_high': None, 'avg_low': None, 'avg_mean': None, 'avg_daylight_hrs': None, 'avg_precip_in': 0.0
        })
        daylight_hrs = round(d / 3600.0, 2) if d is not None else None
        p_val = round(pr, 3) if pr is not None else 0.0
        norm_p_val = normal['avg_precip_in'] if normal['avg_precip_in'] is not None else 0.0
        
        cum_obs_pr += p_val
        cum_norm_pr += norm_p_val
        
        if h is not None and normal['avg_high'] is not None:
            by_month_data[m_key]['h_obs'].append(h)
            by_month_data[m_key]['h_avg'].append(normal['avg_high'])
        if l is not None and normal['avg_low'] is not None:
            by_month_data[m_key]['l_obs'].append(l)
            by_month_data[m_key]['l_avg'].append(normal['avg_low'])
        if m is not None and normal['avg_mean'] is not None:
            by_month_data[m_key]['m_obs'].append(m)
            by_month_data[m_key]['m_avg'].append(normal['avg_mean'])

        observations.append({
            'date': t,
            'mmdd': mmdd,
            'observed_high': h,
            'observed_low': l,
            'observed_mean': m,
            'daylight_hours': daylight_hrs,
            'sunrise': sr[11:] if sr and len(sr) >= 16 else None,
            'sunset': ss[11:] if ss and len(ss) >= 16 else None,
            'observed_precip_in': p_val,
            'cum_observed_precip_in': round(cum_obs_pr, 2),
            'cum_avg_precip_in': round(cum_norm_pr, 2),
            'avg_high': normal['avg_high'],
            'avg_low': normal['avg_low'],
            'avg_mean': normal['avg_mean'],
            'avg_daylight_hrs': normal['avg_daylight_hrs'],
            'avg_precip_in': normal['avg_precip_in']
        })

    # 3. Cross-correlation computation (Lag Analysis)
    dates_sorted = sorted(climate_normals.keys())
    dates_365 = [d for d in dates_sorted if d != '02-29']
    
    daylight_series = [climate_normals[d]['avg_daylight_hrs'] for d in dates_365]
    temp_series = [climate_normals[d]['avg_mean'] for d in dates_365]

    def mean(lst): return sum(lst) / len(lst) if lst else 0.0

    m_sun, m_temp = mean(daylight_series), mean(temp_series)
    s_sun, s_temp = std_dev(daylight_series), std_dev(temp_series)

    cross_corr = []
    max_corr = -1
    best_lag = 0

    for lag in range(-60, 61):
        n = len(dates_365)
        cov = 0
        for i in range(n):
            sun_val = daylight_series[(i - lag) % n]
            temp_val = temp_series[i]
            cov += (sun_val - m_sun) * (temp_val - m_temp)
        r = cov / (s_sun * s_temp * n)
        cross_corr.append({'lag_days': lag, 'r': round(r, 4)})
        if r > max_corr:
            max_corr = r
            best_lag = lag

    total_obs_precip = round(cum_obs_pr, 2)
    total_norm_precip = round(cum_norm_pr, 2)
    precip_anomaly = round(total_obs_precip - total_norm_precip, 2)

    # 4. Detailed Monthly & Seasonal Anomaly Breakdown
    monthly_anomalies = []
    for m_key in sorted(by_month_data.keys()):
        v = by_month_data[m_key]
        h_anom = round(mean(v['h_obs']) - mean(v['h_avg']), 2)
        l_anom = round(mean(v['l_obs']) - mean(v['l_avg']), 2)
        m_anom = round(mean(v['m_obs']) - mean(v['m_avg']), 2)
        monthly_anomalies.append({
            'month': m_key,
            'high_anomaly': h_anom,
            'low_anomaly': l_anom,
            'mean_anomaly': m_anom
        })

    seasons_map = {
        'Winter': ['12', '01', '02'],
        'Spring': ['03', '04', '05'],
        'Summer': ['06', '07', '08'],
        'Autumn': ['09', '10', '11']
    }

    seasonal_anomalies = {}
    for s_name, m_list in seasons_map.items():
        s_h = [m['high_anomaly'] for m in monthly_anomalies if m['month'][5:] in m_list]
        s_l = [m['low_anomaly'] for m in monthly_anomalies if m['month'][5:] in m_list]
        s_m = [m['mean_anomaly'] for m in monthly_anomalies if m['month'][5:] in m_list]
        seasonal_anomalies[s_name] = {
            'high_anomaly': round(mean(s_h), 2),
            'low_anomaly': round(mean(s_l), 2),
            'mean_anomaly': round(mean(s_m), 2)
        }

    # 5. Residual Variation Statistics
    high_res = [o['observed_high'] - o['avg_high'] for o in observations if o['observed_high'] is not None and o['avg_high'] is not None]
    low_res = [o['observed_low'] - o['avg_low'] for o in observations if o['observed_low'] is not None and o['avg_low'] is not None]
    obs_precip_series = [o['observed_precip_in'] for o in observations if o['observed_precip_in'] is not None]

    def calc_percentile(sorted_lst, p):
        if not sorted_lst: return 0.0
        idx = (len(sorted_lst) - 1) * (p / 100.0)
        floor = math.floor(idx)
        ceil = math.ceil(idx)
        if floor == ceil: return sorted_lst[int(idx)]
        return sorted_lst[floor] * (ceil - idx) + sorted_lst[ceil] * (idx - floor)

    h_res_sorted = sorted(high_res)
    l_res_sorted = sorted(low_res)

    roll7_precip = []
    for i in range(len(obs_precip_series)):
        sub = obs_precip_series[max(0, i-6):i+1]
        roll7_precip.append(sum(sub) / len(sub))
    roll7_precip_sorted = sorted(roll7_precip)

    precip_stats = {
        'obs_daily_std': round(std_dev(obs_precip_series), 3),
        'typical_hist_daily_std': typical_hist_std_precip,
        'obs_roll7_std': round(std_dev(roll7_precip), 3),
        'roll7_p25': round(calc_percentile(roll7_precip_sorted, 25), 3),
        'roll7_p75': round(calc_percentile(roll7_precip_sorted, 75), 3),
        'roll7_iqr': round(calc_percentile(roll7_precip_sorted, 75) - calc_percentile(roll7_precip_sorted, 25), 3),
        'wet_days_obs': sum(1 for p in obs_precip_series if p >= 0.01),
        'wet_days_norm': typical_hist_wet_days,
        'heavy_days_obs': sum(1 for p in obs_precip_series if p >= 0.50),
        'heavy_days_norm': typical_hist_heavy_days,
        'max_1day_obs': round(max(obs_precip_series), 2) if obs_precip_series else 0.0,
        'max_1day_norm_typical': typical_hist_annual_max_event
    }

    residual_stats = {
        'high': {
            'mean': round(mean(high_res), 2),
            'std_dev': round(std_dev(high_res), 2),
            'p25': round(calc_percentile(h_res_sorted, 25), 1),
            'p75': round(calc_percentile(h_res_sorted, 75), 1),
            'iqr': round(calc_percentile(h_res_sorted, 75) - calc_percentile(h_res_sorted, 25), 1),
            'p05': round(calc_percentile(h_res_sorted, 5), 1),
            'p95': round(calc_percentile(h_res_sorted, 95), 1),
            'typical_hist_std': typical_hist_std_high
        },
        'low': {
            'mean': round(mean(low_res), 2),
            'std_dev': round(std_dev(low_res), 2),
            'p25': round(calc_percentile(l_res_sorted, 25), 1),
            'p75': round(calc_percentile(l_res_sorted, 75), 1),
            'iqr': round(calc_percentile(l_res_sorted, 75) - calc_percentile(l_res_sorted, 25), 1),
            'p05': round(calc_percentile(l_res_sorted, 5), 1),
            'p95': round(calc_percentile(l_res_sorted, 95), 1),
            'typical_hist_std': typical_hist_std_low
        }
    }

    result = {
        'location': 'Seattle, WA',
        'latitude': lat,
        'longitude': lon,
        'generated_at': datetime.now().isoformat(),
        'best_lag_days': best_lag,
        'max_correlation': round(max_corr, 4),
        'total_observed_precip_in': total_obs_precip,
        'total_normal_precip_in': total_norm_precip,
        'precip_anomaly_in': precip_anomaly,
        'precip_anomaly_pct': round((precip_anomaly / total_norm_precip) * 100, 1) if total_norm_precip else 0,
        'monthly_anomalies': monthly_anomalies,
        'seasonal_anomalies': seasonal_anomalies,
        'residual_stats': residual_stats,
        'precip_stats': precip_stats,
        'climate_normals': climate_normals,
        'observations': observations,
        'cross_correlation': cross_corr
    }

    out_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(out_dir, '..'))
    
    json_path = os.path.join(project_root, 'weather_data.json')
    public_json_path = os.path.join(project_root, 'public', 'weather_data.json')
    js_path = os.path.join(project_root, 'weather_data.js')
    
    os.makedirs(os.path.dirname(public_json_path), exist_ok=True)
    
    # Save files
    with open(json_path, 'w') as f:
        json.dump(result, f, indent=2)
    with open(public_json_path, 'w') as f:
        json.dump(result, f, indent=2)
    with open(js_path, 'w') as f:
        f.write(f"window.SEATTLE_WEATHER_DATA = {json.dumps(result, indent=2)};")
        
    print(f"Data saved successfully! Date bounds: {observations[0]['date']} to {observations[-1]['date']} ({len(observations)} days)")

if __name__ == '__main__':
    fetch_seattle_weather()
