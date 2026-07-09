#include <iostream>
#include <vector>
#include <string>
#include <queue>
#include <unordered_map>
#include <algorithm>
#include <cmath>
#include <tuple>
#include "parser.h"

#define all(v) v.begin(), v.end()

using namespace std;

// A local struct to isolate calculation metrics per algorithm run, removing global arrays entirely
struct AlgorithmResult {
    vector<int> finishTime;
    vector<int> turnAroundTime;
    vector<double> normTurn;
    vector<vector<char>> timeline;

    AlgorithmResult(int process_count, int last_instant) {
        finishTime.resize(process_count, 0);
        turnAroundTime.resize(process_count, 0);
        normTurn.resize(process_count, 0.0);
        timeline.resize(last_instant, vector<char>(process_count, ' '));
    }
};

/** Algorithm Strategy Functions passing context by reference **/

void firstComeFirstServe(SimulationContext &ctx, AlgorithmResult &res)
{
    int time = ctx.processes[0].arrival;
    for (int i = 0; i < ctx.process_count; i++)
    {
        int arrivalTime = ctx.processes[i].arrival;
        int serviceTime = ctx.processes[i].service;

        res.finishTime[i] = (time + serviceTime);
        res.turnAroundTime[i] = (res.finishTime[i] - arrivalTime);
        res.normTurn[i] = (res.turnAroundTime[i] * 1.0 / serviceTime);

        for (int j = time; j < res.finishTime[i]; j++)
            if (j < ctx.last_instant) res.timeline[j][i] = '*';
        for (int j = arrivalTime; j < time; j++)
            if (j < ctx.last_instant) res.timeline[j][i] = '.';
        time += serviceTime;
    }
}

void roundRobin(SimulationContext &ctx, AlgorithmResult &res, int originalQuantum)
{
    queue<pair<int,int>> q;
    int j = 0;
    if (ctx.processes[j].arrival == 0) {
        q.push(make_pair(j, ctx.processes[j].service));
        j++;
    }
    int currentQuantum = originalQuantum;
    for (int time = 0; time < ctx.last_instant; time++) {
        if (!q.empty()) {
            int processIndex = q.front().first;
            q.front().second = q.front().second - 1;
            int remainingServiceTime = q.front().second;
            int arrivalTime = ctx.processes[processIndex].arrival;
            int serviceTime = ctx.processes[processIndex].service;
            currentQuantum--;
            if (time < ctx.last_instant) res.timeline[time][processIndex] = '*';
            
            while (j < ctx.process_count && ctx.processes[j].arrival == time + 1) {
                q.push(make_pair(j, ctx.processes[j].service));
                j++;
            }

            if (currentQuantum == 0 && remainingServiceTime == 0) {
                res.finishTime[processIndex] = time + 1;
                res.turnAroundTime[processIndex] = (res.finishTime[processIndex] - arrivalTime);
                res.normTurn[processIndex] = (res.turnAroundTime[processIndex] * 1.0 / serviceTime);
                currentQuantum = originalQuantum;
                q.pop();
            } else if (currentQuantum == 0 && remainingServiceTime != 0) {
                q.pop();
                q.push(make_pair(processIndex, remainingServiceTime));
                currentQuantum = originalQuantum;
            } else if (currentQuantum != 0 && remainingServiceTime == 0) {
                res.finishTime[processIndex] = time + 1;
                res.turnAroundTime[processIndex] = (res.finishTime[processIndex] - arrivalTime);
                res.normTurn[processIndex] = (res.turnAroundTime[processIndex] * 1.0 / serviceTime);
                q.pop();
                currentQuantum = originalQuantum;
            }
        }
        while (j < ctx.process_count && ctx.processes[j].arrival == time + 1) {
            q.push(make_pair(j, ctx.processes[j].service));
            j++;
        }
    }
    
    // Fill in wait times natively
    for (int i = 0; i < ctx.process_count; i++) {
        int arrivalTime = ctx.processes[i].arrival;
        for (int k = arrivalTime; k < res.finishTime[i]; k++) {
            if (k < ctx.last_instant && res.timeline[k][i] != '*') res.timeline[k][i] = '.';
        }
    }
}

void shortestProcessNext(SimulationContext &ctx, AlgorithmResult &res)
{
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq; // pair of service time and index
    int j = 0;
    for (int i = 0; i < ctx.last_instant; i++)
    {
        while(j < ctx.process_count && ctx.processes[j].arrival <= i){
            pq.push(make_pair(ctx.processes[j].service, j));
            j++;
        }
        if (!pq.empty())
        {
            int processIndex = pq.top().second;
            int arrivalTime = ctx.processes[processIndex].arrival;
            int serviceTime = ctx.processes[processIndex].service;
            pq.pop();

            int temp = arrivalTime;
            for (; temp < i; temp++)
                if (temp < ctx.last_instant) res.timeline[temp][processIndex] = '.';

            temp = i;
            for (; temp < i + serviceTime; temp++)
                if (temp < ctx.last_instant) res.timeline[temp][processIndex] = '*';

            res.finishTime[processIndex] = (i + serviceTime);
            res.turnAroundTime[processIndex] = (res.finishTime[processIndex] - arrivalTime);
            res.normTurn[processIndex] = (res.turnAroundTime[processIndex] * 1.0 / serviceTime);
            i = temp - 1;
        }
    }
}

void shortestRemainingTime(SimulationContext &ctx, AlgorithmResult &res)
{
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;
    int j = 0;
    for (int i = 0; i < ctx.last_instant; i++)
    {
        while(j < ctx.process_count && ctx.processes[j].arrival == i){
            pq.push(make_pair(ctx.processes[j].service, j));
            j++;
        }
        if (!pq.empty())
        {
            int processIndex = pq.top().second;
            int remainingTime = pq.top().first;
            pq.pop();
            int serviceTime = ctx.processes[processIndex].service;
            int arrivalTime = ctx.processes[processIndex].arrival;
            if (i < ctx.last_instant) res.timeline[i][processIndex] = '*';

            if (remainingTime == 1) // process finished
            {
                res.finishTime[processIndex] = i + 1;
                res.turnAroundTime[processIndex] = (res.finishTime[processIndex] - arrivalTime);
                res.normTurn[processIndex] = (res.turnAroundTime[processIndex] * 1.0 / serviceTime);
            }
            else
            {
                pq.push(make_pair(remainingTime - 1, processIndex));
            }
        }
    }
    
    for (int i = 0; i < ctx.process_count; i++) {
        int arrivalTime = ctx.processes[i].arrival;
        for (int k = arrivalTime; k < res.finishTime[i]; k++) {
            if (k < ctx.last_instant && res.timeline[k][i] != '*') res.timeline[k][i] = '.';
        }
    }
}

void highestResponseRatioNext(SimulationContext &ctx, AlgorithmResult &res)
{
    vector<tuple<string, double, int>> present_processes;
    int j = 0;
    for (int current_instant = 0; current_instant < ctx.last_instant; current_instant++)
    {
        while(j < ctx.process_count && ctx.processes[j].arrival <= current_instant){
            present_processes.push_back(make_tuple(ctx.processes[j].name, 1.0, 0));
            j++;
        }
        
        for (auto &proc : present_processes)
        {
            string process_name = get<0>(proc);
            int process_index = ctx.processToIndex[process_name];
            int wait_time = current_instant - ctx.processes[process_index].arrival;
            int service_time = ctx.processes[process_index].service;
            if (service_time <= 0) get<1>(proc) = 1.0;
            else get<1>(proc) = (wait_time + service_time) * 1.0 / service_time;
        }

        sort(all(present_processes), [](tuple<string, double, int> a, tuple<string, double, int> b){
            return get<1>(a) > get<1>(b);
        });

        if (!present_processes.empty())
        {
            int process_index = ctx.processToIndex[get<0>(present_processes[0])];
            while(current_instant < ctx.last_instant && get<2>(present_processes[0]) != ctx.processes[process_index].service){
                if (current_instant < ctx.last_instant) res.timeline[current_instant][process_index] = '*';
                current_instant++;
                get<2>(present_processes[0])++;
            }
            current_instant--;
            present_processes.erase(present_processes.begin());
            res.finishTime[process_index] = current_instant + 1;
            res.turnAroundTime[process_index] = res.finishTime[process_index] - ctx.processes[process_index].arrival;
            res.normTurn[process_index] = (res.turnAroundTime[process_index] * 1.0 / ctx.processes[process_index].service);
        }
    }
    
    for (int i = 0; i < ctx.process_count; i++) {
        int arrivalTime = ctx.processes[i].arrival;
        for (int k = arrivalTime; k < res.finishTime[i]; k++) {
            if (k < ctx.last_instant && res.timeline[k][i] != '*') res.timeline[k][i] = '.';
        }
    }
}

void feedbackQ1(SimulationContext &ctx, AlgorithmResult &res)
{
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq; //pair of priority level and process index
    unordered_map<int,int> remainingServiceTime; //map from process index to the remaining service time
    int j = 0;
    if(ctx.processes[0].arrival == 0){
        pq.push(make_pair(0, j));
        remainingServiceTime[j] = ctx.processes[j].service;
        j++;
    }
    for(int time = 0; time < ctx.last_instant; time++){
        if(!pq.empty()){
            int priorityLevel = pq.top().first;
            int processIndex = pq.top().second;
            int arrivalTime = ctx.processes[processIndex].arrival;
            int serviceTime = ctx.processes[processIndex].service;
            pq.pop();
            while(j < ctx.process_count && ctx.processes[j].arrival == time + 1){
                pq.push(make_pair(0, j));
                remainingServiceTime[j] = ctx.processes[j].service;
                j++;
            }
            remainingServiceTime[processIndex]--;
            if (time < ctx.last_instant) res.timeline[time][processIndex] = '*';
            if(remainingServiceTime[processIndex] == 0){
                res.finishTime[processIndex] = time + 1;
                res.turnAroundTime[processIndex] = (res.finishTime[processIndex] - arrivalTime);
                res.normTurn[processIndex] = (res.turnAroundTime[processIndex] * 1.0 / serviceTime);
            }else{
                pq.push(make_pair(priorityLevel + 1, processIndex));
            }
        }
        while(j < ctx.process_count && ctx.processes[j].arrival == time + 1){
            pq.push(make_pair(0, j));
            remainingServiceTime[j] = ctx.processes[j].service;
            j++;
        }
    }
    
    for (int i = 0; i < ctx.process_count; i++) {
        int arrivalTime = ctx.processes[i].arrival;
        for (int k = arrivalTime; k < res.finishTime[i]; k++) {
            if (k < ctx.last_instant && res.timeline[k][i] != '*') res.timeline[k][i] = '.';
        }
    }
}

void feedbackQ2i(SimulationContext &ctx, AlgorithmResult &res)
{
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;
    unordered_map<int,int> remainingServiceTime;
    int j = 0;
    if(ctx.processes[0].arrival == 0){
        pq.push(make_pair(0, j));
        remainingServiceTime[j] = ctx.processes[j].service;
        j++;
    }
    for(int time = 0; time < ctx.last_instant; time++){
        if(!pq.empty()){
            int priorityLevel = pq.top().first;
            int processIndex = pq.top().second;
            int arrivalTime = ctx.processes[processIndex].arrival;
            int serviceTime = ctx.processes[processIndex].service;
            pq.pop();
            while(j < ctx.process_count && ctx.processes[j].arrival <= time + 1){
                pq.push(make_pair(0, j));
                remainingServiceTime[j] = ctx.processes[j].service;
                j++;
            }

            int currentQuantum = pow(2, priorityLevel);
            int temp = time;
            while(currentQuantum && remainingServiceTime[processIndex]){
                currentQuantum--;
                remainingServiceTime[processIndex]--;
                if (temp++ < ctx.last_instant) res.timeline[temp++][processIndex] = '*';
            }

            if(remainingServiceTime[processIndex] == 0){
                res.finishTime[processIndex] = temp;
                res.turnAroundTime[processIndex] = (res.finishTime[processIndex] - arrivalTime);
                res.normTurn[processIndex] = (res.turnAroundTime[processIndex] * 1.0 / serviceTime);
            }else{
                pq.push(make_pair(priorityLevel + 1, processIndex));
            }
            time = temp - 1;
        }
        while(j < ctx.process_count && ctx.processes[j].arrival <= time + 1){
            pq.push(make_pair(0, j));
            remainingServiceTime[j] = ctx.processes[j].service;
            j++;
        }
    }
    
    for (int i = 0; i < ctx.process_count; i++) {
        int arrivalTime = ctx.processes[i].arrival;
        for (int k = arrivalTime; k < res.finishTime[i]; k++) {
            if (k < ctx.last_instant && res.timeline[k][i] != '*') res.timeline[k][i] = '.';
        }
    }
}

void aging(SimulationContext &ctx, AlgorithmResult &res, int originalQuantum)
{
    vector<tuple<int,int,int>> v; // tuple of priority level, process index, and total waiting time
    int j = 0, currentProcess = -1;
    for(int time = 0; time < ctx.last_instant; time++){
        while(j < ctx.process_count && ctx.processes[j].arrival <= time){
            v.push_back(make_tuple(ctx.processes[j].priority, j, 0));
            j++;
        }

        for(int i = 0; i < (int)v.size(); i++){
            if(get<1>(v[i]) == currentProcess){
                get<2>(v[i]) = 0;
                get<0>(v[i]) = ctx.processes[currentProcess].priority;
            }
            else{
                get<0>(v[i])++;
                get<2>(v[i])++;
            }
        }
        
        sort(v.begin(), v.end(), [](const tuple<int,int,int>& a, const tuple<int,int,int>& b){
            if(get<0>(a) == get<0>(b))
                return get<2>(a) > get<2>(b);
            return get<0>(a) > get<0>(b);
        });
        
        currentProcess = get<1>(v[0]);
        int currentQuantum = originalQuantum;
        while(currentQuantum-- && time < ctx.last_instant){
            if (time < ctx.last_instant) res.timeline[time][currentProcess] = '*';
            time++;
        }
        time--;
    }
    
    for (int i = 0; i < ctx.process_count; i++) {
        int arrivalTime = ctx.processes[i].arrival;
        // In aging finishTime is not usually set in original logic, we just pad to last_instant
        for (int k = arrivalTime; k < ctx.last_instant; k++) { 
            if (k < ctx.last_instant && res.timeline[k][i] != '*') res.timeline[k][i] = '.';
        }
    }
}

// Helper maps for algorithm catalog naming conventions
const string ALGORITHMS[9] = {"", "FCFS", "RR-", "SPN", "SRT", "HRRN", "FB-1", "FB-2i", "AGING"};

void execute_algorithm(char id, int quantum, SimulationContext &ctx, AlgorithmResult &res) {
    switch (id) {
        case '1': firstComeFirstServe(ctx, res); break;
        case '2': roundRobin(ctx, res, quantum); break;
        case '3': shortestProcessNext(ctx, res); break;
        case '4': shortestRemainingTime(ctx, res); break;
        case '5': highestResponseRatioNext(ctx, res); break;
        case '6': feedbackQ1(ctx, res); break;
        case '7': feedbackQ2i(ctx, res); break;
        case '8': aging(ctx, res, quantum); break;
        default: firstComeFirstServe(ctx, res); break; 
    }
}

int main()
{
    SimulationContext ctx;
    if (!ctx.parseFromStdin()) {
        cerr << "{\"error\": \"Failed to parse standard input context layers.\"}" << endl;
        return 1;
    }

    // Explicit boundary assertions against overflow manipulations
    if (ctx.last_instant <= 0 || ctx.last_instant > 10000) {
        cerr << "{\"error\": \"last_instant out of safe boundaries.\"}" << endl;
        return 1;
    }
    if (ctx.process_count <= 0 || ctx.process_count > 100) {
        cerr << "{\"error\": \"process_count out of safe boundaries.\"}" << endl;
        return 1;
    }

    // Stream out unified JSON array structure
    cout << "[";

    for (int idx = 0; idx < (int)ctx.algorithms.size(); idx++)
    {
        AlgorithmResult res(ctx.process_count, ctx.last_instant);
        execute_algorithm(ctx.algorithms[idx].first, ctx.algorithms[idx].second, ctx, res);
        
        int algorithm_id = ctx.algorithms[idx].first - '0';
        string algo_name = ALGORITHMS[algorithm_id];
        if (algorithm_id == 2) algo_name += to_string(ctx.algorithms[idx].second);

        cout << "{";
        cout << "\"algorithm\":\"" << algo_name << "\",";
        
        // 1. Serialize Timeline Traces Matrix
        cout << "\"timeline\":{";
        for (int i = 0; i < ctx.process_count; i++) {
            cout << "\"" << ctx.processes[i].name << "\":[";
            for (int j = 0; j < ctx.last_instant; j++) {
                if (res.timeline[j][i] == '*') cout << "\"*\"";
                else if (res.timeline[j][i] == '.') cout << "\".\"";
                else cout << "\" \"";
                if (j < ctx.last_instant - 1) cout << ",";
            }
            cout << "]";
            if (i < ctx.process_count - 1) cout << ",";
        }
        cout << "},";

        // 2. Serialize Performance Statistical Metrics
        cout << "\"statistics\":{";
        int sum_turnaround = 0;
        double sum_normturn = 0;
        
        cout << "\"processes\":[";
        for (int i = 0; i < ctx.process_count; i++) {
            sum_turnaround += res.turnAroundTime[i];
            sum_normturn += res.normTurn[i];
            
            cout << "{";
            cout << "\"name\":\"" << ctx.processes[i].name << "\",";
            cout << "\"arrival\":" << ctx.processes[i].arrival << ",";
            cout << "\"service\":" << ctx.processes[i].service << ",";
            cout << "\"finish\":" << res.finishTime[i] << ",";
            cout << "\"turnaround\":" << res.turnAroundTime[i] << ",";
            if (isnan(res.normTurn[i])) cout << "\"normturn\":0";
            else cout << "\"normturn\":" << res.normTurn[i];
            cout << "}";
            if (i < ctx.process_count - 1) cout << ",";
        }
        cout << "],";
        
        double meanTurnaround = (1.0 * sum_turnaround / ctx.process_count);
        double meanNormTurn = (sum_normturn / ctx.process_count);
        if (isnan(meanNormTurn)) meanNormTurn = 0;
        
        cout << "\"meanTurnaround\":" << meanTurnaround << ",";
        cout << "\"meanNormTurn\":" << meanNormTurn;
        cout << "}"; 
        
        cout << "}"; 
        if (idx < (int)ctx.algorithms.size() - 1) cout << ",";
    }

    cout << "]";
    
    cout << std::flush;
    return 0;
}
