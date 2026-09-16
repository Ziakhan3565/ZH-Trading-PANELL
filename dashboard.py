"""
dashboard.py
============
Streamlit Quantitative Research & Paper-Trading Dashboard.
Visualizes real-time Binance Order Book Microstructure, BMS, ML Confirmation,
Anti-Flip Persistent Signals, and Trade Target Levels for all monitored coins.
"""

import time
import pandas as pd
import numpy as np

try:
    import streamlit as st
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots
    STREAMLIT_AVAILABLE = True
except ImportError:
    STREAMLIT_AVAILABLE = False

from auto_collector import BinanceDataCollector
from big_move_engine import SignalType


def init_collector():
    if "collector" not in st.session_state:
        st.session_state.collector = BinanceDataCollector(
            symbols=["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "XRPUSDT"]
        )
    return st.session_state.collector


def run_streamlit_dashboard():
    if not STREAMLIT_AVAILABLE:
        print("Streamlit not installed in this environment. Run with: streamlit run dashboard.py")
        return

    st.set_page_config(
        page_title="Crypto Microstructure Quantitative Terminal",
        page_icon="⚡",
        layout="wide",
        initial_sidebar_state="expanded",
    )

    st.markdown(
        """
        <style>
        .metric-card {
            background-color: #1e222d;
            border: 1px solid #2a2e39;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 8px;
        }
        .signal-badge-long { color: #00e676; font-weight: bold; }
        .signal-badge-short { color: #ff5252; font-weight: bold; }
        .signal-badge-wait { color: #b0bec5; font-weight: bold; }
        </style>
        """,
        unsafe_allow_html=True,
    )

    collector = init_collector()

    st.sidebar.title("⚡ Signal Engine Control")
    auto_refresh = st.sidebar.checkbox("Auto-poll Binance data", value=True)
    refresh_sec = st.sidebar.slider("Refresh interval (s)", min_value=2, max_value=30, value=5)
    
    st.sidebar.markdown("---")
    st.sidebar.subheader("System Weights")
    st.sidebar.write("• OFI: 28% | OBI: 22%")
    st.sidebar.write("• Depth Depletion: 18%")
    st.sidebar.write("• Taker Flow: 16%")
    st.sidebar.write("• Impact & Trend: 8% each")
    st.sidebar.write("• Quant/ML Blend: 65% / 35%")
    st.sidebar.write("• Signal Expiry: 20 Minutes")

    # Header
    st.title("Crypto Microstructure & 15-20 Min Signal Engine")
    st.caption("Real-Time Binance Order Book Top-50 Depth • Order Flow Imbalance • ML Confirmation • Anti-Flip Persistence")

    # Fetch signals for all coins
    with st.spinner("Fetching Binance microstructure data for all coins..."):
        results = collector.run_once()

    # Overview table preparation
    table_rows = []
    for sym, sig in results.items():
        if sig is None:
            table_rows.append({
                "Coin": sym,
                "Signal": "WAIT (NO DATA)",
                "Confidence": "0.0%",
                "BMS": "0.00",
                "ML Prob": "0.33 / 0.34 / 0.33",
                "Agreement": "0.0%",
                "Entry": 0.0,
                "SL": 0.0,
                "TP1": 0.0,
                "TP2": 0.0,
                "Age": "0s",
                "Expiry": "N/A",
                "Risk Flags": "NONE",
            })
            continue

        sig_val = sig.signal.value
        flags_str = ",".join(sig.risk_flags.active_flags()) or "CLEAR"
        age_str = f"{int(sig.signal_age_seconds // 60)}m {int(sig.signal_age_seconds % 60)}s"

        table_rows.append({
            "Coin": sym,
            "Signal": sig_val,
            "Confidence": f"{sig.confidence:.1f}%",
            "BMS": f"{sig.bms:+.3f}",
            "ML Prob": f"L:{sig.ml_long_prob:.2f} W:{sig.ml_wait_prob:.2f} S:{sig.ml_short_prob:.2f}",
            "Agreement": f"{sig.directional_agreement * 100:.0f}%",
            "Entry": f"${sig.entry_price:,.2f}",
            "SL": f"${sig.stop_loss:,.2f}",
            "TP1": f"${sig.tp1:,.2f}",
            "TP2": f"${sig.tp2:,.2f}",
            "Age": age_str,
            "Expiry": sig.expires_at.split(" ")[-1] if " " in sig.expires_at else sig.expires_at,
            "Risk Flags": flags_str,
        })

    df_table = pd.DataFrame(table_rows)
    st.subheader("📊 Monitored Symbols Overview")
    st.dataframe(df_table, use_container_width=True, hide_index=True)

    # Detailed Coin View
    st.markdown("---")
    col_sel, col_stat = st.columns([1, 2])
    with col_sel:
        selected_coin = st.selectbox("Select Coin for Deep Microstructure Inspection", collector.symbols)

    selected_sig = results.get(selected_coin)
    if selected_sig:
        st.markdown(f"### 🔍 Deep Inspection: `{selected_coin}`")

        m1, m2, m3, m4, m5, m6 = st.columns(6)
        m1.metric("Signal", selected_sig.signal.value)
        m2.metric("Confidence", f"{selected_sig.confidence:.1f}%")
        m3.metric("Big Move Score (BMS)", f"{selected_sig.bms:+.4f}")
        m4.metric("Agreement", f"{selected_sig.directional_agreement*100:.0f}%")
        m5.metric("Entry Price", f"${selected_sig.entry_price:,.2f}")
        m6.metric("Risk Distance", f"${selected_sig.risk_distance:,.2f}")

        # Fetch klines for visual chart
        df_k = collector.fetch_klines(selected_coin, interval="1m", limit=50)
        if not df_k.empty:
            fig = make_subplots(rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.04, row_heights=[0.75, 0.25])
            fig.add_trace(go.Candlestick(
                x=pd.to_datetime(df_k["open_time"], unit="ms"),
                open=df_k["open"], high=df_k["high"], low=df_k["low"], close=df_k["close"],
                name="OHLCV"
            ), row=1, col=1)

            # Targets overlay
            fig.add_hline(y=selected_sig.stop_loss, line_dash="dot", line_color="#ff5252", annotation_text="SL", row=1, col=1)
            fig.add_hline(y=selected_sig.tp1, line_dash="dash", line_color="#00e676", annotation_text="TP1 (1:2)", row=1, col=1)
            fig.add_hline(y=selected_sig.tp2, line_dash="solid", line_color="#00e676", annotation_text="TP2 (1:3)", row=1, col=1)

            fig.add_trace(go.Bar(
                x=pd.to_datetime(df_k["open_time"], unit="ms"),
                y=df_k["volume"],
                name="Volume",
                marker_color="#374151"
            ), row=2, col=1)

            fig.update_layout(height=450, margin=dict(l=20, r=20, t=20, b=20), template="plotly_dark")
            st.plotly_chart(fig, use_container_width=True)

        # Microstructure Gauges
        c_left, c_right = st.columns(2)
        with c_left:
            st.markdown("#### Microstructure Directional Components")
            st.write(f"• **Directional Agreement:** {selected_sig.directional_agreement * 100:.0f}%")
            for comp, dirn in selected_sig.agreement_breakdown.items():
                color = "green" if dirn == "BULLISH" else ("red" if dirn == "BEARISH" else "gray")
                st.markdown(f"- **{comp}**: :{color}[{dirn}]")

        with c_right:
            st.markdown("#### Machine Learning Probability Distribution")
            p_df = pd.DataFrame({
                "State": ["LONG", "WAIT", "SHORT"],
                "Probability": [selected_sig.ml_long_prob, selected_sig.ml_wait_prob, selected_sig.ml_short_prob]
            })
            st.bar_chart(p_df.set_index("State"))

    if auto_refresh:
        time.sleep(refresh_sec)
        st.rerun()


if __name__ == "__main__":
    run_streamlit_dashboard()
