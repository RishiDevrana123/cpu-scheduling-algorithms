#ifndef PARSER_H
#define PARSER_H

#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <unordered_map>
#include <tuple>

using namespace std;

// Clean, explicit structure representing an isolated Process block
struct Process {
    string name;
    int arrival;
    int service;
    int priority;
};

// Object-Oriented Simulation Context containing isolated execution states
class SimulationContext {
public:
    string operation;
    vector<pair<char, int>> algorithms; // holds pairs of {algorithm_id, quantum}
    int last_instant;
    int process_count;
    vector<Process> processes;
    unordered_map<string, int> processToIndex;

    // Zero out state data encapsulation natively upon initialization
    SimulationContext() : last_instant(0), process_count(0) {}

    // Encapsulated parser to ingest the space-separated string from standard input
    bool parseFromStdin() {
        string input_line;
        if (!getline(cin, input_line) || input_line.empty()) {
            return false;
        }

        stringstream ss(input_line);
        
        // 1. Parse Operation (e.g., "trace" or "stats")
        ss >> operation;

        // 2. Parse Algorithms String comma-separated (e.g., "1,2-2")
        string algos_raw;
        ss >> algos_raw;
        stringstream algo_ss(algos_raw);
        string single_algo;
        while (getline(algo_ss, single_algo, ',')) {
            if (single_algo.empty()) continue;
            char id = single_algo[0];
            int quantum = 1; // Default fallback quantum
            if (single_algo.find('-') != string::npos) {
                quantum = stoi(single_algo.substr(single_algo.find('-') + 1));
            }
            algorithms.push_back({id, quantum});
        }

        // 3. Parse Timeline Constants
        ss >> last_instant;
        ss >> process_count;

        // 4. Parse Individual Processes (Format: Name,Arrival,Service)
        for (int i = 0; i < process_count; i++) {
            string proc_chunk;
            if (!(ss >> proc_chunk)) break;

            stringstream proc_ss(proc_chunk);
            string name, arrival_str, service_str;
            
            getline(proc_ss, name, ',');
            getline(proc_ss, arrival_str, ',');
            getline(proc_ss, service_str, ',');

            Process p;
            p.name = name;
            p.arrival = stoi(arrival_str);
            p.service = stoi(service_str);
            p.priority = p.service; // Default priority maps to service line

            processes.push_back(p);
            processToIndex[p.name] = i;
        }

        return true;
    }
};

#endif // PARSER_H
