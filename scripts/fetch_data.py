import urllib.request
import json
import os
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import math
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from dateutil.tz import gettz as ZoneInfo

def compute_solar_times_for_date(d_obj, lat=47.6062, lon=-122.3321):
    tz_local = ZoneInfo('America/Los_Angeles')
    tz_standard = timezone(timedelta(hours=-8))
    
    N = d_obj.timetuple().tm_yday
    lngHour = lon / 15.0
    M = (0.9856 * N) - 3.289
    L = (M + (1.916 * math.sin(math.radians(M))) + (0.020 * math.sin(math.radians(2 * M))) + 282.634) % 360
    
    RA = math.degrees(math.atan(0.91764 * math.tan(math.radians(L)))) % 360
    Lquadrant = (math.floor(L / 90.0)) * 90.0
    RAquadrant = (math.floor(RA / 90.0)) * 90.0
    RA = (RA + (Lquadrant - RAquadrant)) / 15.0
    
    sinDec = 0.39782 * math.sin(math.radians(L))
    cosDec = math.cos(math.asin(sinDec))
    
    zenith = 90.8333 # 90 deg 50 arcmin (atmospheric refraction + solar disk radius)
    cosH = (math.cos(math.radians(zenith)) - (sinDec * math.sin(math.radians(lat)))) / (cosDec * math.cos(math.radians(lat)))
    
    H_set = math.degrees(math.acos(cosH))
    H_rise = 360.0 - H_set
    
    daylight_hours = 2.0 * H_set / 15.0
    dur_min = daylight_hours * 60.0
    
    T_rise = (H_rise / 15.0) + RA - (0.06571 * N) - 6.622 - lngHour
    T_noon = T_rise + (daylight_hours / 2.0)
    T_set = T_rise + daylight_hours
    
    dt_base = datetime(d_obj.year, d_obj.month, d_obj.day, tzinfo=timezone.utc)
    sr_utc = dt_base + timedelta(hours=T_rise)
    ss_utc = dt_base + timedelta(hours=T_set)
    sn_utc = dt_base + timedelta(hours=T_noon)
    
    sr_loc = sr_utc.astimezone(tz_local)
    ss_loc = ss_utc.astimezone(tz_local)
    sn_loc = sn_utc.astimezone(tz_local)
    
    sr_std = sr_utc.astimezone(tz_standard)
    ss_std = ss_utc.astimezone(tz_standard)
    sn_std = sn_utc.astimezone(tz_standard)
    
    dur_h = int(dur_min // 60)
    dur_m = int(round(dur_min % 60))
    
    def fmt_12h(dt):
        h = dt.hour
        m = dt.minute
        ampm = 'PM' if h >= 12 else 'AM'
        h12 = 12 if h % 12 == 0 else h % 12
        return f"{h12}:{m:02d} {ampm}"
    
    return {
        'date': d_obj.strftime('%Y-%m-%d'),
        'mmdd': d_obj.strftime('%m-%d'),
        'sr_civil': sr_loc.strftime('%H:%M'),
        'ss_civil': ss_loc.strftime('%H:%M'),
        'sn_civil': sn_loc.strftime('%H:%M'),
        'sr_civil_12h': fmt_12h(sr_loc),
        'ss_civil_12h': fmt_12h(ss_loc),
        'sn_civil_12h': fmt_12h(sn_loc),
        'sr_civil_dec': round(sr_loc.hour + sr_loc.minute / 60.0 + sr_loc.second / 3600.0, 3),
        'ss_civil_dec': round(ss_loc.hour + ss_loc.minute / 60.0 + ss_loc.second / 3600.0, 3),
        'sn_civil_dec': round(sn_loc.hour + sn_loc.minute / 60.0 + sn_loc.second / 3600.0, 3),
        'sr_std': sr_std.strftime('%H:%M'),
        'ss_std': ss_std.strftime('%H:%M'),
        'sn_std': sn_std.strftime('%H:%M'),
        'sr_std_12h': fmt_12h(sr_std),
        'ss_std_12h': fmt_12h(ss_std),
        'sn_std_12h': fmt_12h(sn_std),
        'sr_std_dec': round(sr_std.hour + sr_std.minute / 60.0 + sr_std.second / 3600.0, 3),
        'ss_std_dec': round(ss_std.hour + ss_std.minute / 60.0 + ss_std.second / 3600.0, 3),
        'sn_std_dec': round(sn_std.hour + sn_std.minute / 60.0 + sn_std.second / 3600.0, 3),
        'daylight_min': round(dur_min, 1),
        'daylight_hrs_dec': round(daylight_hours, 2),
        'daylight_str': f"{dur_h}h {dur_m:02d}m"
    }

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

    # 2-Harmonic Fourier Regression to smooth daily normals and remove 10-year synoptic sample noise
    def fit_fourier_2harmonics(y_list):
        n = len(y_list)
        omega = 2.0 * math.pi / n
        a0 = sum(y_list) / n
        a1 = (2.0 / n) * sum(y * math.cos(omega * t) for t, y in enumerate(y_list))
        b1 = (2.0 / n) * sum(y * math.sin(omega * t) for t, y in enumerate(y_list))
        a2 = (2.0 / n) * sum(y * math.cos(2.0 * omega * t) for t, y in enumerate(y_list))
        b2 = (2.0 / n) * sum(y * math.sin(2.0 * omega * t) for t, y in enumerate(y_list))
        
        def eval_at(t_val):
            return (a0 + 
                    a1 * math.cos(omega * t_val) + b1 * math.sin(omega * t_val) + 
                    a2 * math.cos(2.0 * omega * t_val) + b2 * math.sin(2.0 * omega * t_val))
                    
        return [eval_at(t) for t in range(n)], eval_at

    days_365 = [d for d in sorted(climate_normals.keys()) if d != '02-29']
    raw_highs = [climate_normals[d]['avg_high'] for d in days_365]
    raw_lows = [climate_normals[d]['avg_low'] for d in days_365]
    raw_means = [climate_normals[d]['avg_mean'] for d in days_365]

    smooth_highs, eval_high = fit_fourier_2harmonics(raw_highs)
    smooth_lows, eval_low = fit_fourier_2harmonics(raw_lows)
    smooth_means, eval_mean = fit_fourier_2harmonics(raw_means)

    for idx, d in enumerate(days_365):
        climate_normals[d]['raw_avg_high'] = climate_normals[d]['avg_high']
        climate_normals[d]['raw_avg_low'] = climate_normals[d]['avg_low']
        climate_normals[d]['raw_avg_mean'] = climate_normals[d]['avg_mean']
        
        climate_normals[d]['avg_high'] = round(smooth_highs[idx], 1)
        climate_normals[d]['avg_low'] = round(smooth_lows[idx], 1)
        climate_normals[d]['avg_mean'] = round(smooth_means[idx], 1)
        
        climate_normals[d]['smooth_high'] = round(smooth_highs[idx], 1)
        climate_normals[d]['smooth_low'] = round(smooth_lows[idx], 1)
        climate_normals[d]['smooth_mean'] = round(smooth_means[idx], 1)

    if '02-29' in climate_normals:
        climate_normals['02-29']['raw_avg_high'] = climate_normals['02-29']['avg_high']
        climate_normals['02-29']['raw_avg_low'] = climate_normals['02-29']['avg_low']
        climate_normals['02-29']['raw_avg_mean'] = climate_normals['02-29']['avg_mean']
        
        climate_normals['02-29']['avg_high'] = round(eval_high(58.5), 1)
        climate_normals['02-29']['avg_low'] = round(eval_low(58.5), 1)
        climate_normals['02-29']['avg_mean'] = round(eval_mean(58.5), 1)
        climate_normals['02-29']['smooth_high'] = round(eval_high(58.5), 1)
        climate_normals['02-29']['smooth_low'] = round(eval_low(58.5), 1)
        climate_normals['02-29']['smooth_mean'] = round(eval_mean(58.5), 1)

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

        d_obj = datetime.strptime(t, '%Y-%m-%d').date()
        solar_info = compute_solar_times_for_date(d_obj, lat, lon)

        observations.append({
            'date': t,
            'mmdd': mmdd,
            'observed_high': h,
            'observed_low': l,
            'observed_mean': m,
            'daylight_hours': solar_info['daylight_hrs_dec'],
            'daylight_minutes': solar_info['daylight_min'],
            'daylight_str': solar_info['daylight_str'],
            'sunrise': solar_info['sr_civil'],
            'sunset': solar_info['ss_civil'],
            'solar_noon': solar_info['sn_civil'],
            'sunrise_12h': solar_info['sr_civil_12h'],
            'sunset_12h': solar_info['ss_civil_12h'],
            'solar_noon_12h': solar_info['sn_civil_12h'],
            'sunrise_dec': solar_info['sr_civil_dec'],
            'sunset_dec': solar_info['ss_civil_dec'],
            'solar_noon_dec': solar_info['sn_civil_dec'],
            'sunrise_std': solar_info['sr_std'],
            'sunset_std': solar_info['ss_std'],
            'solar_noon_std': solar_info['sn_std'],
            'sunrise_std_12h': solar_info['sr_std_12h'],
            'sunset_std_12h': solar_info['ss_std_12h'],
            'sunrise_std_dec': solar_info['sr_std_dec'],
            'sunset_std_dec': solar_info['ss_std_dec'],
            'solar_noon_std_dec': solar_info['sn_std_dec'],
            'observed_precip_in': p_val,
            'cum_observed_precip_in': round(cum_obs_pr, 2),
            'cum_avg_precip_in': round(cum_norm_pr, 2),
            'avg_high': normal['avg_high'],
            'avg_low': normal['avg_low'],
            'avg_mean': normal['avg_mean'],
            'smooth_high': normal['avg_high'],
            'smooth_low': normal['avg_low'],
            'smooth_mean': normal['avg_mean'],
            'raw_avg_high': normal.get('raw_avg_high', normal['avg_high']),
            'raw_avg_low': normal.get('raw_avg_low', normal['avg_low']),
            'raw_avg_mean': normal.get('raw_avg_mean', normal['avg_mean']),
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

    # 6. Detailed Harmonic Analysis & Seasonal Asymmetry (A1 vs A2)
    def compute_harmonic_payload(series_raw):
        n = len(series_raw)
        omega = 2.0 * math.pi / n
        a0 = sum(series_raw) / n
        a1 = (2.0 / n) * sum(y * math.cos(omega * t) for t, y in enumerate(series_raw))
        b1 = (2.0 / n) * sum(y * math.sin(omega * t) for t, y in enumerate(series_raw))
        a2 = (2.0 / n) * sum(y * math.cos(2.0 * omega * t) for t, y in enumerate(series_raw))
        b2 = (2.0 / n) * sum(y * math.sin(2.0 * omega * t) for t, y in enumerate(series_raw))
        
        A1 = math.sqrt(a1**2 + b1**2)
        phi1 = math.atan2(b1, a1)
        t_peak1 = (phi1 / omega) % n
        
        A2 = math.sqrt(a2**2 + b2**2)
        phi2 = math.atan2(b2, a2)
        
        h1_curve = [round(a0 + a1 * math.cos(omega * t) + b1 * math.sin(omega * t), 2) for t in range(n)]
        h2_comp = [round(a2 * math.cos(2.0 * omega * t) + b2 * math.sin(2.0 * omega * t), 2) for t in range(n)]
        composite = [round(h1_curve[t] + h2_comp[t], 2) for t in range(n)]
        
        deriv = [
            round(
                -a1 * omega * math.sin(omega * t) + b1 * omega * math.cos(omega * t)
                - 2.0 * a2 * omega * math.sin(2.0 * omega * t) + 2.0 * b2 * omega * math.cos(2.0 * omega * t),
                3
            ) for t in range(n)
        ]
        deriv_h1 = [
            round(-a1 * omega * math.sin(omega * t) + b1 * omega * math.cos(omega * t), 3)
            for t in range(n)
        ]
        
        ss_tot = sum((y - a0)**2 for y in series_raw)
        ss_res_h1 = sum((y - y_hat)**2 for y, y_hat in zip(series_raw, h1_curve))
        ss_res_full = sum((y - y_hat)**2 for y, y_hat in zip(series_raw, composite))
        
        r2_h1 = round(1.0 - (ss_res_h1 / ss_tot), 4) if ss_tot else 1.0
        r2_full = round(1.0 - (ss_res_full / ss_tot), 4) if ss_tot else 1.0
        
        max_warm_idx = deriv.index(max(deriv))
        max_cool_idx = deriv.index(min(deriv))
        
        return {
            'a0': round(a0, 2),
            'a1': round(a1, 3), 'b1': round(b1, 3),
            'a2': round(a2, 3), 'b2': round(b2, 3),
            'A1': round(A1, 2), 'phi1_rad': round(phi1, 3), 'phi1_deg': round(phi1 * 180.0 / math.pi, 1),
            'peak_day_1': dates_365[int(t_peak1)],
            'r2_1': r2_h1,
            'A2': round(A2, 2), 'phi2_rad': round(phi2, 3), 'phi2_deg': round(phi2 * 180.0 / math.pi, 1),
            'r2_full': r2_full,
            'r2_boost_pct': round((r2_full - r2_h1) * 100.0, 2),
            'max_warming_rate': max(deriv),
            'max_warming_day': dates_365[max_warm_idx],
            'max_cooling_rate': min(deriv),
            'max_cooling_day': dates_365[max_cool_idx],
            'asymmetry_ratio': round(abs(min(deriv)) / max(deriv), 2) if max(deriv) > 0 else 1.0,
            'curves': {
                'days': dates_365,
                'raw': [round(y, 1) for y in series_raw],
                'harmonic1': h1_curve,
                'harmonic2_component': h2_comp,
                'composite': composite,
                'derivative': deriv,
                'derivative_h1': deriv_h1
            }
        }

    def compute_daylight_harmonic_payload(series_hours):
        n = len(series_hours)
        omega = 2.0 * math.pi / n
        a0 = sum(series_hours) / n
        a1 = (2.0 / n) * sum(y * math.cos(omega * t) for t, y in enumerate(series_hours))
        b1 = (2.0 / n) * sum(y * math.sin(omega * t) for t, y in enumerate(series_hours))
        a2 = (2.0 / n) * sum(y * math.cos(2.0 * omega * t) for t, y in enumerate(series_hours))
        b2 = (2.0 / n) * sum(y * math.sin(2.0 * omega * t) for t, y in enumerate(series_hours))

        # dD/dt in minutes per day: 60 * d(hours)/dt
        deriv_unrounded = [
            60.0 * (
                -a1 * omega * math.sin(omega * t) + b1 * omega * math.cos(omega * t)
                - 2.0 * a2 * omega * math.sin(2.0 * omega * t) + 2.0 * b2 * omega * math.cos(2.0 * omega * t)
            ) for t in range(n)
        ]
        deriv_min = [round(val, 2) for val in deriv_unrounded]

        max_idx = deriv_unrounded.index(max(deriv_unrounded))
        min_idx = deriv_unrounded.index(min(deriv_unrounded))

        return {
            'a0_hrs': round(a0, 2),
            'max_gain_min_day': max(deriv_min),
            'max_gain_day': dates_365[max_idx],
            'max_loss_min_day': min(deriv_min),
            'max_loss_day': dates_365[min_idx],
            'derivative': deriv_min
        }

    daylight_payload = compute_daylight_harmonic_payload([climate_normals[d]['avg_daylight_hrs'] for d in dates_365])

    harmonic_analysis = {
        'high': compute_harmonic_payload([climate_normals[d]['raw_avg_high'] for d in dates_365]),
        'mean': compute_harmonic_payload([climate_normals[d]['raw_avg_mean'] for d in dates_365]),
        'low': compute_harmonic_payload([climate_normals[d]['raw_avg_low'] for d in dates_365]),
        'daylight': daylight_payload
    }

    # Attach daylight_derivative to each series' curves for convenient client plotting
    for k in ['high', 'mean', 'low']:
        harmonic_analysis[k]['curves']['daylight_derivative'] = daylight_payload['derivative']

    # 7. Solar Schedule (Sunrise, Sunset, Solar Noon) & Extrema
    solar_records = [
        compute_solar_times_for_date(datetime.strptime(o['date'], '%Y-%m-%d').date(), lat, lon)
        for o in observations
    ]
    earliest_sr = min(solar_records, key=lambda x: x['sr_civil_dec'])
    latest_sr = max(solar_records, key=lambda x: x['sr_civil_dec'])
    earliest_ss = min(solar_records, key=lambda x: x['ss_civil_dec'])
    latest_ss = max(solar_records, key=lambda x: x['ss_civil_dec'])
    max_daylight = max(solar_records, key=lambda x: x['daylight_min'])
    min_daylight = min(solar_records, key=lambda x: x['daylight_min'])
    swing_min = max_daylight['daylight_min'] - min_daylight['daylight_min']
    swing_str = f"{int(swing_min // 60)}h {int(round(swing_min % 60))}m"

    solar_schedule = {
        'records': solar_records,
        'extrema': {
            'earliest_sunrise': {
                'time_12h': earliest_sr['sr_civil_12h'],
                'time_24h': earliest_sr['sr_civil'],
                'date': earliest_sr['date'],
                'mmdd': earliest_sr['mmdd']
            },
            'latest_sunrise': {
                'time_12h': latest_sr['sr_civil_12h'],
                'time_24h': latest_sr['sr_civil'],
                'date': latest_sr['date'],
                'mmdd': latest_sr['mmdd']
            },
            'earliest_sunset': {
                'time_12h': earliest_ss['ss_civil_12h'],
                'time_24h': earliest_ss['ss_civil'],
                'date': earliest_ss['date'],
                'mmdd': earliest_ss['mmdd']
            },
            'latest_sunset': {
                'time_12h': latest_ss['ss_civil_12h'],
                'time_24h': latest_ss['ss_civil'],
                'date': latest_ss['date'],
                'mmdd': latest_ss['mmdd']
            },
            'max_daylight': {
                'duration': max_daylight['daylight_str'],
                'minutes': max_daylight['daylight_min'],
                'date': max_daylight['date']
            },
            'min_daylight': {
                'duration': min_daylight['daylight_str'],
                'minutes': min_daylight['daylight_min'],
                'date': min_daylight['date']
            },
            'annual_daylight_swing': swing_str
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
        'harmonic_analysis': harmonic_analysis,
        'solar_schedule': solar_schedule,
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
