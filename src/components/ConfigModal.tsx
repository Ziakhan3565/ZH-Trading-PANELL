/**
 * ConfigModal.tsx
 * Live configuration editor for quantitative microstructure weights,
 * BMS parameters, ML blend, anti-flip thresholds, and risk bounds.
 */

import React, { useState } from 'react';
import { X, Sliders, RotateCcw, Check } from 'lucide-react';
import { EngineConfig } from '../types';
import { DEFAULT_CONFIG } from '../engine/bigMoveEngine';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: EngineConfig;
  onSaveConfig: (newConfig: EngineConfig) => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [formData, setFormData] = useState<EngineConfig>({ ...config });

  if (!isOpen) return null;

  const handleReset = () => {
    setFormData({ ...DEFAULT_CONFIG });
  };

  const handleSave = () => {
    onSaveConfig(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-xl rounded-xl border border-[#30363d] bg-[#161b22] p-6 shadow-2xl text-xs text-[#e6edf3] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#30363d] pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Engine Parameters & Weights</h2>
              <p className="text-[#8b949e] text-[11px]">
                Fine-tune quantitative microstructural formulas, BMS components & thresholds
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#8b949e] hover:bg-[#21262d] hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Section 1: Multi-Level OBI Decay */}
          <div className="rounded-lg bg-[#0d1117] p-3.5 border border-[#30363d] space-y-3">
            <h3 className="font-semibold text-white text-xs">1. Multi-Level OBI Weights & Decay</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Decay Lambda (exp(-λ*k)):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.lambdaParam}
                  onChange={(e) =>
                    setFormData({ ...formData, lambdaParam: parseFloat(e.target.value) || 0.1 })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Level 5 Weight (w5):
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.obiWeights[0]}
                  onChange={(e) => {
                    const newW = [...formData.obiWeights] as [number, number, number, number];
                    newW[0] = parseFloat(e.target.value) || 0.1;
                    setFormData({ ...formData, obiWeights: newW });
                  }}
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Level 10 Weight (w10):
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.obiWeights[1]}
                  onChange={(e) => {
                    const newW = [...formData.obiWeights] as [number, number, number, number];
                    newW[1] = parseFloat(e.target.value) || 0.15;
                    setFormData({ ...formData, obiWeights: newW });
                  }}
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Level 20 Weight (w20):
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.obiWeights[2]}
                  onChange={(e) => {
                    const newW = [...formData.obiWeights] as [number, number, number, number];
                    newW[2] = parseFloat(e.target.value) || 0.3;
                    setFormData({ ...formData, obiWeights: newW });
                  }}
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Big Move Score (BMS) Component Weights */}
          <div className="rounded-lg bg-[#0d1117] p-3.5 border border-[#30363d] space-y-3">
            <h3 className="font-semibold text-white text-xs">2. Big Move Score (BMS) Weights</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">OFI (28%):</label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.bmsWeights.ofi}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bmsWeights: { ...formData.bmsWeights, ofi: parseFloat(e.target.value) || 0.28 },
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-2 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">OBI (22%):</label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.bmsWeights.obi}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bmsWeights: { ...formData.bmsWeights, obi: parseFloat(e.target.value) || 0.22 },
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-2 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">Depth (18%):</label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.bmsWeights.directionalDepth}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bmsWeights: {
                        ...formData.bmsWeights,
                        directionalDepth: parseFloat(e.target.value) || 0.18,
                      },
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-2 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">Taker (16%):</label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.bmsWeights.takerFlow}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bmsWeights: {
                        ...formData.bmsWeights,
                        takerFlow: parseFloat(e.target.value) || 0.16,
                      },
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-2 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">Impact (8%):</label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.bmsWeights.priceImpact}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bmsWeights: {
                        ...formData.bmsWeights,
                        priceImpact: parseFloat(e.target.value) || 0.08,
                      },
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-2 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">Trend (8%):</label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.bmsWeights.trendScore}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bmsWeights: {
                        ...formData.bmsWeights,
                        trendScore: parseFloat(e.target.value) || 0.08,
                      },
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-2 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Quant vs ML Blend & Signal Thresholds */}
          <div className="rounded-lg bg-[#0d1117] p-3.5 border border-[#30363d] space-y-3">
            <h3 className="font-semibold text-white text-xs">3. Signal Thresholds & Anti-Flip</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Quant Weight (e.g. 0.65):
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.quantWeight}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantWeight: parseFloat(e.target.value) || 0.65,
                      mlWeight: 1.0 - (parseFloat(e.target.value) || 0.65),
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  ML Weight (e.g. 0.35):
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.mlWeight}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      mlWeight: parseFloat(e.target.value) || 0.35,
                      quantWeight: 1.0 - (parseFloat(e.target.value) || 0.35),
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Strong Signal Threshold:
                </label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.strongThreshold}
                  onChange={(e) =>
                    setFormData({ ...formData, strongThreshold: parseFloat(e.target.value) || 0.68 })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Normal Signal Threshold:
                </label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.normalThreshold}
                  onChange={(e) =>
                    setFormData({ ...formData, normalThreshold: parseFloat(e.target.value) || 0.42 })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Min Directional Agreement:
                </label>
                <input
                  type="number"
                  step="0.02"
                  value={formData.minAgreement}
                  onChange={(e) =>
                    setFormData({ ...formData, minAgreement: parseFloat(e.target.value) || 0.66 })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] block mb-1">
                  Reversal Confirmations (Anti-Flip):
                </label>
                <input
                  type="number"
                  value={formData.reversalConfirmations}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      reversalConfirmations: parseInt(e.target.value) || 3,
                    })
                  }
                  className="w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between border-t border-[#30363d] pt-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#8b949e] hover:bg-[#21262d] hover:text-white transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to Defaults</span>
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg bg-[#21262d] px-4 py-2 text-xs font-semibold text-[#c9d1d9] hover:bg-[#30363d] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-sm"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Apply Parameters</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
