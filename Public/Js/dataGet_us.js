const { createClient } = globalThis.supabase;

const supabase = createClient(
    'https://uoxzcftzwemdrmcmhuhb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVveHpjZnR6d2VtZHJtY21odWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjkwNDMsImV4cCI6MjA2OTcwNTA0M30.0IVKS1y4dgjgQbNPTonITxki8btCAREEF2VPjL_0jvc'
);

// 根据过滤条件（state, city, district）获取分页数据
export async function fetchData(state, city, district, pageNumber = 1, pageSize = 20) {
    const from = (pageNumber - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
        let query = supabase.from('house_ger').select('*').range(from, to);

        // 根据用户选择的 state, city, district 添加过滤条件
        if (state) {
            query = query.eq('display_state', state);
        }
        if (city) {
            query = query.eq('display_city', city);
        }
        if (district) {
            query = query.eq('display_district', district);
        }

        query = query.order('statetype',{ ascending: true })

        const { data, error } = await query;

        // 如果发生错误，抛出异常
        if (error) {
            throw new Error(`获取数据时发生错误: ${error.message}`);
        }

        return { data, error: null };
    } catch (err) {
        console.error('fetchData 错误:', err);
        return { data: null, error: err.message };
    }
}

export async function countHouses(state = null, city = null, district = null) {

    if(state == ""){
        state = null
    }

    if(city == ""){
        city = null
    }

    if(district == ""){
        district = null
    }


    try {
        const { data, error } = await supabase.rpc('count_houses_by_location', {
            input_state: state,
            input_city: city,
            input_district: district
        });

        if (error) {
            throw new Error(`统计房源数量时发生错误: ${error.message}`);
        }

        return { count: data, error: null };
    } catch (err) {
        console.error('countHouses 错误:', err);
        return { count: null, error: err.message };
    }
}

const EXCLUDED_US_STATES = new Set(['District of Columbia']);

// 通过 RPC 获取所有去重后的州
export async function attachStateHouseCounts(states) {
    return Promise.all((states || []).map(async (item) => {
        const { count } = await countHouses(item.display_state);
        return { ...item, house_count: count ?? 0 };
    }));
}

export async function attachCityHouseCounts(state, cities) {
    return Promise.all((cities || []).map(async (item) => {
        const { count } = await countHouses(state, item.display_city);
        return { ...item, house_count: count ?? 0 };
    }));
}

export async function attachDistrictHouseCounts(state, city, districts) {
    return Promise.all((districts || []).map(async (item) => {
        const { count } = await countHouses(state, city, item.display_district);
        return { ...item, house_count: count ?? 0 };
    }));
}

export async function fetchDistinctStates() {
    try {
        const { data, error } = await supabase.rpc('get_unique_states');
        if (error) {
            throw new Error(`获取州时发生错误: ${error.message}`);
        }
        const filtered = (data || []).filter(
            (item) => !EXCLUDED_US_STATES.has(item.display_state)
        );
        return { data: filtered, error: null };
    } catch (err) {
        console.error('fetchDistinctStates 错误:', err);
        return { data: null, error: err.message };
    }
}

// 通过 RPC 获取某个州的所有城市
export async function fetchCitiesByState(state) {
    try {
        const { data, error } = await supabase.rpc('get_cities_by_state', { input_state: state });
        if (error) {
            throw new Error(`获取城市时发生错误: ${error.message}`);
        }
        return { data, error: null };
    } catch (err) {
        console.error('fetchCitiesByState 错误:', err);
        return { data: null, error: err.message };
    }
}

// 通过 state + city 获取某个城市的所有区（同名 city 可能跨州重复，必须带 state）
export async function fetchDistrictsByCity(state, city) {
    if (city === undefined) {
        city = state;
        state = null;
    }

    try {
        if (state) {
            const { data, error } = await supabase
                .from('house_ger')
                .select('display_district')
                .eq('display_state', state)
                .eq('display_city', city);

            if (error) {
                throw new Error(`获取区时发生错误: ${error.message}`);
            }

            const seen = new Set();
            const unique = [];
            for (const row of data || []) {
                const district = row.display_district;
                if (district && !seen.has(district)) {
                    seen.add(district);
                    unique.push({ display_district: district });
                }
            }
            unique.sort((a, b) => a.display_district.localeCompare(b.display_district));
            return { data: unique, error: null };
        }

        const { data, error } = await supabase.rpc('get_districts_by_city', { input_city: city });
        if (error) {
            throw new Error(`获取区时发生错误: ${error.message}`);
        }
        return { data, error: null };
    } catch (err) {
        console.error('fetchDistrictsByCity 错误:', err);
        return { data: null, error: err.message };
    }
}

// 根据 ID 查询房源数据
export async function fetchDataById(id) {
    try {
        const { data, error } = await supabase
            .from('house_ger')
            .select('*')
            .eq('id', id)  // 根据id过滤
            .single(); // 获取单条数据

        if (error) {
            throw new Error(`根据ID查询房源时发生错误: ${error.message}`);
        }

        return { data, error: null };
    } catch (err) {
        console.error('fetchDataById 错误:', err);
        return { data: null, error: err.message };
    }
}

// 根据 display_state 随机获取 5 条房源
export async function fetchRandomHousesByState(displayState = 'Arizona', count = 5) {
    try {
        const { data, error } = await supabase.rpc('get_random_houses_by_state', {
            input_state: displayState,
            count: count
        });

        if (error) {
            throw new Error(`获取随机房源时出错: ${error.message}`);
        }

        return { data, error: null };
    } catch (err) {
        console.error('fetchRandomHousesByState 错误:', err);
        return { data: null, error: err.message };
    }
}


