import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.0.0/+esm';

const supabase = createClient(
    'https://aabogtftiapiwehgmezt.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhYm9ndGZ0aWFwaXdlaGdtZXp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3MDEyNTgsImV4cCI6MjA2NjI3NzI1OH0.qU2mirqnkhRtHNduka5SNwoi2K3q7tNaCJL7EfKMwCY'
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



// 通过 RPC 获取所有去重后的州
export async function fetchDistinctStates() {
    try {
        const { data, error } = await supabase.rpc('get_unique_states');
        if (error) {
            throw new Error(`获取州时发生错误: ${error.message}`);
        }
        return { data, error: null };
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

// 通过 RPC 获取某个城市的所有区
export async function fetchDistrictsByCity(city) {
    try {
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
export async function fetchRandomHousesByState(displayState = 'Berlin', count = 5) {
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


