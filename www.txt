<?php

namespace App\Http\Controllers;

use App\Constants\Status;
use App\Lib\CurlRequest;
use App\Lib\HyipLab;
use App\Models\CronJob;
use App\Models\CronJobLog;
use App\Models\Invest;
use App\Models\Plan;
use App\Models\ScheduleInvest;
use App\Models\StakingInvest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\UserRanking;
use App\Models\Trade;
use Carbon\Carbon;

class CronController extends Controller
{
    public function cron()
    {
        $general            = gs();
        $general->last_cron = now();
        $general->save();

        $crons = CronJob::with('schedule');

        if (request()->alias) {
            $crons->where('alias', request()->alias);
        } else {
            $crons->where('next_run', '<', now())->where('is_running', Status::YES);
        }
        $crons = $crons->get();
        foreach ($crons as $cron) {
            $cronLog              = new CronJobLog();
            $cronLog->cron_job_id = $cron->id;
            $cronLog->start_at    = now();
            if ($cron->is_default) {
                $controller = new $cron->action[0];
                try {
                    $method = $cron->action[1];
                    $controller->$method();
                } catch (\Exception $e) {
                    $cronLog->error = $e->getMessage();
                }
            } else {
                try {
                    CurlRequest::curlContent($cron->url);
                    
                } catch (\Exception $e) {
                    $cronLog->error = $e->getMessage();
                }
            }
            $cron->last_run = now();
            $cron->next_run = now()->addSeconds((int) $cron->schedule->interval);
            $cron->save();

            $cronLog->end_at = $cron->last_run;

            $startTime         = Carbon::parse($cronLog->start_at);
            $endTime           = Carbon::parse($cronLog->end_at);
            $diffInSeconds     = $startTime->diffInSeconds($endTime);
            $cronLog->duration = $diffInSeconds;
            $cronLog->save();
        }

        // Keep Aviator Services Alive
        try {
            $this->checkAviatorServices();
        } catch (\Exception $e) {
            \Log::error("Aviator Cron Error: " . $e->getMessage());
        }

        // Run AI Bots Logic (Force Run for Debug Output)
        try {
            $this->aiBots();
        } catch (\Throwable $e) {
            echo "AI Bots Internal Error: " . $e->getMessage() . "<br>";
            \Log::error("AI Bots Cron Error: " . $e->getMessage());
        }

        // Run Mining Logic (Force Run for Debug Output)
        try {
            $this->mining();
        } catch (\Throwable $e) {
            echo "Mining Internal Error: " . $e->getMessage() . "<br>";
            \Log::error("Mining Cron Error: " . $e->getMessage());
        }



        if (request()->target == 'all') {
            $notify[] = ['success', 'Cron executed successfully'];
            return back()->withNotify($notify);
        }
        if (request()->alias) {
            $notify[] = ['success', keyToTitle(request()->alias) . ' executed successfully'];
            return back()->withNotify($notify);
        }
    }

    public function interest()
    {
        try {
            $now     = Carbon::now();
            $general = gs();

            $day    = strtolower(date('D'));
            $offDay = (array) $general->off_day;
            if (array_key_exists($day, $offDay)) {
                echo "Holiday";
                exit;
            }

            $invests = Invest::with('plan.timeSetting', 'user')->where('status', Status::INVEST_RUNNING)->where('next_time', '<=', $now)->orderBy('last_time')->take(100)->get();

            foreach ($invests as $invest) {
                $now  = $now;
                $next = HyipLab::nextWorkingDay($invest->plan?->timeSetting->time);
                $user = $invest->user;

                $invest->return_rec_time += 1;
                $invest->paid += $invest->interest;
                $invest->should_pay -= $invest->period > 0 ? $invest->interest : 0;
                $invest->next_time = $next;
                $invest->last_time = $now;
                $invest->net_interest += $invest->rem_compound_times ? 0 : $invest->interest;

                // Add Return Amount to user's Interest Balance
                $user->interest_wallet += $invest->interest;
                $user->save();

                $trx = getTrx();

                // Create The Transaction for Interest Back
                $transaction               = new Transaction();
                $transaction->user_id      = $user->id;
                $transaction->invest_id    = $invest->id;
                $transaction->amount       = $invest->interest;
                $transaction->charge       = 0;
                $transaction->post_balance = $user->interest_wallet;
                $transaction->trx_type     = '+';
                $transaction->trx          = $trx;
                $transaction->remark       = 'interest';
                $transaction->wallet_type  = 'interest_wallet';
                $transaction->details      = showAmount($invest->interest) . ' interest from ' . @$invest->plan->name;
                $transaction->save();

                // Give Referral Commission if Enabled
                if ($general->invest_return_commission == 1) {
                    $commissionType = 'invest_return_commission';
                    HyipLab::levelCommission($user, $invest->interest, $commissionType, $trx, $general);
                }

                // Complete the investment if user get full amount as plan
                if ($invest->return_rec_time >= $invest->period && $invest->period != -1) {
                    $invest->status = 0; // Change Status so he do not get any more return

                    // Give the capital back if plan says the same and hold capital option is disabled
                    if ($invest->capital_status == 1 && !$invest->hold_capital) {
                        HyipLab::capitalReturn($invest);
                    }
                }

                if ($invest->rem_compound_times) {
                    $interest        = $invest->interest;
                    $newInvestAmount = $invest->amount + $interest;
                    $newInterest     = $invest->interest * $newInvestAmount / $invest->amount;
                    $newShouldPay    = $invest->should_pay == -1 ? -1 : ($invest->period - $invest->return_rec_time) * $newInterest;

                    $user->interest_wallet -= $invest->interest;
                    $user->save();

                    $invest->amount     = $newInvestAmount;
                    $invest->interest   = $newInterest;
                    $invest->should_pay = $newShouldPay;
                    $invest->rem_compound_times -= 1;

                    $transaction               = new Transaction();
                    $transaction->user_id      = $user->id;
                    $transaction->invest_id    = $invest->id;
                    $transaction->amount       = $interest;
                    $transaction->post_balance = $user->interest_wallet;
                    $transaction->charge       = 0;
                    $transaction->trx_type     = '-';
                    $transaction->details      = 'Invested Compound on ' . $invest->plan->name;
                    $transaction->trx          = $trx;
                    $transaction->wallet_type  = 'interest_wallet';
                    $transaction->remark       = 'invest_compound';
                    $transaction->save();
                }

                $invest->save();

                notify($user, 'INTEREST', [
                    'trx'          => $invest->trx,
                    'amount'       => showAmount($invest->interest, currencyFormat: false),
                    'plan_name'    => @$invest->plan->name,
                    'post_balance' => showAmount($user->interest_wallet, currencyFormat: false),
                ]);
            }
        } catch (\Throwable $th) {
            throw new \Exception($th->getMessage());
        }
    }

    public function rank()
    {
        try {
            $general = gs();
            if (!$general->user_ranking) {
                return 'MODULE DISABLED';
            }

            $users = User::with('referrals', 'activeReferrals')->orderBy('last_rank_update', 'asc')->limit(100)->get();
            foreach ($users as $user) {
                $user->last_rank_update = now();
                $user->save();

                $userInvests     = $user->total_invests;
                $referralInvests = $user->team_invests;
                $referralCount   = $user->activeReferrals->count();

                $rankings = UserRanking::active()->where('id', '>', $user->user_ranking_id)->where('minimum_invest', '<=', $userInvests)->where('min_referral_invest', '<=', $referralInvests)->where('min_referral', '<=', $referralCount)->get();

                foreach ($rankings as $ranking) {
                    $user->interest_wallet += $ranking->bonus;
                    $user->user_ranking_id = $ranking->id;
                    $user->save();

                    $transaction               = new Transaction();
                    $transaction->user_id      = $user->id;
                    $transaction->amount       = $ranking->bonus;
                    $transaction->charge       = 0;
                    $transaction->post_balance = $user->interest_wallet;
                    $transaction->trx_type     = '+';
                    $transaction->trx          = getTrx();
                    $transaction->remark       = 'ranking_bonus';
                    $transaction->wallet_type  = 'interest_wallet';
                    $transaction->details      = showAmount($ranking->bonus) . ' ranking bonus for ' . @$ranking->name;
                    $transaction->save();
                }
            }
        } catch (\Throwable $th) {
            throw new \Exception($th->getMessage());
        }
    }

    public function investSchedule()
    {
        try {
            if (!gs('schedule_invest')) {
                return 'MODULE DISABLED';
            }

            $scheduleInvests = ScheduleInvest::with('user.deviceTokens', 'plan.timeSetting')->where('next_invest', '<=', now())->where('rem_schedule_times', '>', 0)->where('status', Status::ENABLE)->get();
            $planIds         = array_unique($scheduleInvests->pluck('plan_id')->toArray());
            $activePlanIds   = Plan::whereIn('id', $planIds)->where('status', Status::ENABLE)->whereHas('timeSetting', function ($timeSetting) {
                $timeSetting->where('status', Status::ENABLE);
            })->pluck('id')->toArray();

            foreach ($scheduleInvests as $scheduleInvest) {
                $user   = $scheduleInvest->user;
                $wallet = $scheduleInvest->wallet;

                if ($scheduleInvest->amount > $user->$wallet) {
                    $scheduleInvest->next_invest = now()->addHours((int)$scheduleInvest->interval_hours);
                    $scheduleInvest->save();

                    notify($user, 'INSUFFICIENT_BALANCE', [
                        'invest_amount' => showAmount($scheduleInvest->amount, currencyFormat: false),
                        'wallet'        => keyToTitle($wallet),
                        'plan_name'     => $scheduleInvest->plan->name,
                        'balance'       => showAmount($user->$wallet, currencyFormat: false),
                        'next_schedule' => $scheduleInvest->next_invest,
                    ]);
                    continue;
                }

                if (!in_array($scheduleInvest->plan_id, $activePlanIds)) {
                    continue;
                }

                $hyip = new HyipLab($user, $scheduleInvest->plan);
                $hyip->invest($scheduleInvest->amount, $wallet, $scheduleInvest->compound_times);

                $scheduleInvest->rem_schedule_times -= 1;
                $scheduleInvest->next_invest = $scheduleInvest->rem_schedule_times ? now()->addHours((int)$scheduleInvest->interval_hours) : null;
                $scheduleInvest->status      = $scheduleInvest->rem_schedule_times ? 1 : 0;
                $scheduleInvest->save();
            }
        } catch (\Throwable $th) {
            throw new \Exception($th->getMessage());
        }
    }

    public function staking()
    {
        try {
            $stakingInvests = StakingInvest::with('user')->where('status', Status::STAKING_RUNNING)->where('end_at', '<=', now())->get();

            foreach ($stakingInvests as $stakingInvest) {
                $user = $stakingInvest->user;
                $user->interest_wallet += $stakingInvest->invest_amount + $stakingInvest->interest;
                $user->save();

                $stakingInvest->status = Status::STAKING_COMPLETED;
                $stakingInvest->save();

                $transaction               = new Transaction();
                $transaction->user_id      = $user->id;
                $transaction->amount       = $stakingInvest->invest_amount + $stakingInvest->interest;
                $transaction->post_balance = $user->interest_wallet;
                $transaction->charge       = 0;
                $transaction->trx_type     = '+';
                $transaction->details      = 'Staking invested return';
                $transaction->trx          = getTrx();
                $transaction->wallet_type  = 'interest_wallet';
                $transaction->remark       = 'staking_invest_return';
                $transaction->save();
            }

        } catch (\Throwable $th) {
            throw new \Exception($th->getMessage());
        }
    }

    public function aiBots()
    {
        // 1. Get all active User AI Bots
        // Eager load 'timeSetting' to avoid N+1 and get intervals
        $activeBots = \App\Models\UserAiBot::where('status', 1)->with('user', 'bot.timeSetting')->get();

        foreach ($activeBots as $userBot) {
            try {
                $user = $userBot->user;
                $bot = $userBot->bot;

                if (!$user || !$bot) continue;

                // --- Debug Output ---
                $timeLeft = now()->diff($userBot->end_at);
                $timeLeftStr = $timeLeft->format('%d days, %h hours, %i minutes');
                
                echo "Bot ID: {$userBot->id} | User: {$user->username} | End: {$userBot->end_at} | Left: {$timeLeftStr} | Next Profit: {$userBot->next_profit_at} | Status: RUNNING<br>\n";

                // 1. Profit Distribution
                // We check if it's time for the NEXT profit (and that we haven't exceeded the end date for this specific payout)
                $intervalHours = (int)($bot->timeSetting?->time ?? 24);
                if ($intervalHours < 1) $intervalHours = 24;

                while (now()->greaterThanOrEqualTo($userBot->next_profit_at) && $userBot->next_profit_at->lessThanOrEqualTo($userBot->end_at) && $userBot->status == 1) {
                    
                    // Calculate Profit for this interval
                    $profit = 0;
                    if ($bot->profit_type == 1) {
                        $profit = $bot->daily_profit;
                    } else {
                        $profit = ($userBot->invest_amount * $bot->daily_profit) / 100;
                    }

                    // Add Profit
                    $user->interest_wallet += $profit;
                    $user->save();
                    
                    $userBot->profit_earned += $profit;
                    $userBot->last_profit_at = now();
                    
                    // Schedule Next Profit
                    $userBot->next_profit_at = Carbon::parse($userBot->next_profit_at)->addHours((int)$intervalHours);
                    $userBot->save();

                    // Transaction
                    $transaction = new Transaction();
                    $transaction->user_id = $user->id;
                    $transaction->amount = $profit;
                    $transaction->post_balance = $user->interest_wallet;
                    $transaction->charge = 0;
                    $transaction->trx_type = '+';
                    $transaction->details = 'Ai Bot Profit: ' . $bot->name;
                    $transaction->trx = getTrx();
                    $transaction->remark = 'ai_bot_profit';
                    $transaction->wallet_type = 'interest_wallet';
                    $transaction->save();
                    
                    echo " > Periodic Profit Added: " . $profit . "<br>\n";
                }

                // 2. Completion Check
                if (now()->greaterThanOrEqualTo($userBot->end_at) && $userBot->status == 1) {
                    
                    // Return Capital
                    $user->interest_wallet += $userBot->invest_amount;
                    $user->save();

                    // Mark Complete
                    $userBot->status = 2; // Completed
                    $userBot->save();

                    // Transaction: Capital Return
                    $transaction = new Transaction();
                    $transaction->user_id = $user->id;
                    $transaction->amount = $userBot->invest_amount;
                    $transaction->post_balance = $user->interest_wallet;
                    $transaction->charge = 0;
                    $transaction->trx_type = '+';
                    $transaction->details = 'Capital Return from AI Bot: ' . $bot->name;
                    $transaction->trx = getTrx();
                    $transaction->remark = 'ai_bot_capital_return';
                    $transaction->wallet_type = 'interest_wallet';
                    $transaction->save();

                    echo " > Amount " . showAmount($userBot->invest_amount) . " returned. Bot Completed.<br>\n";

                    notify($user, 'AI_BOT_COMPLETED', [
                        'bot_name' => $bot->name,
                        'amount' => showAmount($userBot->invest_amount, currencyFormat: false),
                        'post_balance' => showAmount($user->interest_wallet, currencyFormat: false),
                    ]);
                }
            
            } catch (\Throwable $th) {
                 echo "Error for Bot ID {$userBot->id}: " . $th->getMessage() . "<br>\n";
                 \Log::error("Cron AI Bot Error for UserBot ID {$userBot->id}: " . $th->getMessage());
            }
        }
    }


    public function mining()
    {
        try {
            // Eager load everything needed
            $activeMinings = \App\Models\UserMining::where('status', 1)->with('user', 'miningPlan.timeSetting')->get();
            echo "Found " . $activeMinings->count() . " active mining records.<br>\n";
            
            foreach ($activeMinings as $mining) {
                try {
                    $user = $mining->user;
                    $plan = $mining->miningPlan;
                    
                    if (!$user || !$plan) continue;

                    // 1. Completion Check
                    if ($mining->end_at && now()->greaterThanOrEqualTo($mining->end_at)) {
                        $mining->status = 2; // Completed
                        $mining->save();
                        echo "Mining ID: {$mining->id} | User: {$user->username} | Status: COMPLETED (Expired)<br>\n";
                        continue;
                    }

                    // 2. Interval Config
                    $intervalHours = (int)($plan->timeSetting?->time ?? 24);
                    if ($intervalHours < 1) $intervalHours = 24;

                    // 3. Initialize next_profit_at if null (for old records)
                    if (!$mining->next_profit_at) {
                        $baseTime = $mining->last_paid ?? $mining->start_at ?? $mining->created_at;
                        $mining->next_profit_at = Carbon::parse($baseTime)->addHours($intervalHours);
                        $mining->save();
                    }

                    // --- Debug Output ---
                    echo "Mining ID: {$mining->id} | User: {$user->username} | Plan: {$plan->name} | Next Profit: {$mining->next_profit_at}<br>\n";

                    // 4. Profit Distribution (Loop to catch up)
                    while (now()->greaterThanOrEqualTo($mining->next_profit_at) && ($mining->end_at ? $mining->next_profit_at->lessThanOrEqualTo($mining->end_at) : true) && $mining->status == 1) {
                        
                        // Calculate Profit (Fixed Percentage from min_return)
                        $profit = ($mining->amount * $plan->min_return) / 100;

                        if ($profit > 0) {
                            $user->interest_wallet += $profit;
                            $user->save();

                            $mining->last_paid = now();
                            // Increment next_profit_at for precision
                            $mining->next_profit_at = $mining->next_profit_at->addHours($intervalHours);
                            $mining->save();

                            // Transaction
                            $transaction = new Transaction();
                            $transaction->user_id = $user->id;
                            $transaction->amount = $profit;
                            $transaction->post_balance = $user->interest_wallet;
                            $transaction->charge = 0;
                            $transaction->trx_type = '+';
                            $transaction->details = 'Mining ROI: ' . $plan->name;
                            $transaction->trx = getTrx();
                            $transaction->remark = 'mining_roi';
                            $transaction->wallet_type = 'interest_wallet';
                            $transaction->save();
                            
                            echo " > Profit Added: " . $profit . "<br>\n";
                        } else {
                            // If profit is 0 (shouldn't happen with gt:0 validation), break to avoid infinite loop
                            break;
                        }
                    }
                } catch (\Throwable $e) {
                     echo "Error for Mining ID {$mining->id}: " . $e->getMessage() . "<br>\n";
                }
            }
        } catch (\Throwable $th) {
            echo "Mining Error: " . $th->getMessage() . "<br>\n";
            \Log::error("Cron Mining Error: " . $th->getMessage());
        }
    }

    public function resolveTrade()
    {
        try {
            $trades = Trade::where('status', 0)->where('finish_at', '<=', now())->with('user')->get();

            foreach($trades as $trade) {
                // SIMULATION LOGIC: Random Win/Loss
                $win = rand(0, 1); 
                
                if($win) {
                    $trade->status = 1; // Win
                    $user = $trade->user;
                    
                    if($user) {
                        $user->interest_wallet += ($trade->amount + $trade->profit);
                        $user->save();

                        $transaction               = new Transaction();
                        $transaction->user_id      = $user->id;
                        $transaction->amount       = $trade->amount + $trade->profit;
                        $transaction->post_balance = $user->interest_wallet;
                        $transaction->charge       = 0;
                        $transaction->trx_type     = '+';
                        $transaction->details      = 'Binary trade win for ' . $trade->crypto_currency;
                        $transaction->trx          = getTrx();
                        $transaction->remark       = 'binary_trade_win';
                        $transaction->wallet_type  = 'interest_wallet';
                        $transaction->save();
                    }
                } else {
                    $trade->status = 2; // Loss
                }
                $trade->save();
            }
        } catch (\Throwable $th) {
            throw new \Exception($th->getMessage());
        }
    }

    public function checkAviatorServices()
    {
        // This method can be called by your global cron job (e.g., every minute)
        // It ensures the Aviator Game Server is running.
        
        // 1. Check & Start Aviator Game Server
        if (!$this->isServiceRunning('aviator:run')) {
            $this->runArtisanInBackground('aviator:run');
        }

        return "Aviator services checked and started if needed.";
    }

    private function isServiceRunning($signature)
    {
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            // Windows check
            $tasklist = shell_exec("wmic process where \"CommandLine like '%{$signature}%'\" get Processid");
            return strpos($tasklist, 'ProcessId') !== false && count(explode("\n", trim($tasklist))) > 1;
        } else {
            // Linux check
            $ps = shell_exec("ps aux | grep '{$signature}' | grep -v grep");
            return !empty($ps);
        }
    }

    private function runArtisanInBackground($signature)
    {
        $phpPath = PHP_BINARY;
        $artisanPath = base_path('artisan');
        
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            // Windows: Use 'start /B' to run in background without opening a window
            $cmd = "start /B {$phpPath} \"{$artisanPath}\" {$signature}";
            pclose(popen($cmd, "r"));
        } else {
            // Linux: Use nohup and redirect output to a log file for debugging
            $cmd = "nohup {$phpPath} \"{$artisanPath}\" {$signature} >> " . storage_path('logs/aviator_services.log') . " 2>&1 &";
            exec($cmd);
        }
    }
}
