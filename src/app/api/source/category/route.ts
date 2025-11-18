import { NextRequest, NextResponse } from 'next/server';
import { getAvailableApiSites } from '@/lib/config';
import { API_CONFIG } from '@/lib/config';
import { cleanHtmlTags } from '@/lib/utils';

// 带超时控制的fetch请求函数
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;

  // 设置8秒超时
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const fetchOptions: RequestInit = {
    ...options,
    signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 从单个API源获取指定分类的视频数据
async function fetchCategoryVideosFromApi(
  apiUrl: string,
  sourceKey: string,
  sourceName: string,
  category: string
): Promise<any[]> {
  try {
    // 根据分类构建搜索关键词
    const searchKeyword = category === '全部'
      ? ['热门', '最新', '推荐'][Math.floor(Math.random() * 3)]
      : category;

    const searchUrl = `${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(searchKeyword)}`;

    const response = await fetchWithTimeout(searchUrl, {
      headers: API_CONFIG.search.headers
    });

    if (!response.ok) {
      console.warn(`Failed to fetch videos from ${sourceName}: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();

    // 确保数据包含视频列表
    if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
      return [];
    }

    // 转换数据格式
    const videos = data.list.map((item: any) => {
      let episodes: string[] = [];
      if (item.vod_play_url) {
        const m3u8Regex = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
        const vod_play_url_array = item.vod_play_url.split('$$$');
        vod_play_url_array.forEach((url: string) => {
          const matches = url.match(m3u8Regex) || [];
          if (matches.length > episodes.length) {
            episodes = matches;
          }
        });
      }

      episodes = Array.from(new Set(episodes)).map((link: string) => {
        link = link.substring(1); // 去掉开头的 $  
        const parenIndex = link.indexOf('(');
        return parenIndex > 0 ? link.substring(0, parenIndex) : link;
      });

      return {
        id: item.vod_id?.toString() || `${sourceKey}-${Math.random().toString(36).substr(2, 9)}`,
        title: item.vod_name?.trim().replace(/\s+/g, ' ') || '未知标题',
        poster: item.vod_pic || '',
        episodes: episodes,
        source: sourceKey,
        source_name: sourceName,
        class: item.vod_class || '',
        year: item.vod_year ? item.vod_year.match(/\d{4}/)?.[0] || '' : 'unknown',
        desc: cleanHtmlTags(item.vod_content || ''),
        type_name: item.type_name || ''
      };
    }).filter((video: any) => video.title && video.poster); // 过滤无效数据

    // 如果是特定分类，尝试根据分类进行过滤
    if (category !== '全部') {
      return videos.filter(video => {
        const videoClass = (video.class || '').toLowerCase();
        const videoTypeName = (video.type_name || '').toLowerCase();
        const videoTitle = (video.title || '').toLowerCase();
        const categoryLower = category.toLowerCase();

        return videoClass.includes(categoryLower) ||
          videoTypeName.includes(categoryLower) ||
          videoTitle.includes(categoryLower);
      });
    }

    return videos;
  } catch (error) {
    console.warn(`Error fetching videos from ${sourceName}:`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category') || '全部';
    const pageLimit = parseInt(searchParams.get('limit') || '25');
    const pageStart = parseInt(searchParams.get('start') || '0');

    // 获取所有可用的视频源
    const apiSites = await getAvailableApiSites(true); // 过滤成人内容

    if (apiSites.length === 0) {
      return NextResponse.json({
        code: 200,
        message: '暂无可用视频源',
        list: []
      });
    }

    // 并行请求所有视频源的数据
    const videosPromises = apiSites.map(site =>
      fetchCategoryVideosFromApi(
        site.api,
        site.key,
        site.name,
        category
      )
    );

    // 等待所有请求完成，使用 Promise.allSettled 避免一个源失败影响其他源
    const results = await Promise.allSettled(videosPromises);

    // 合并所有成功的结果
    const allVideos: any[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allVideos.push(...result.value);
      } else {
        console.warn(`Failed to fetch videos from ${apiSites[index]?.name || 'unknown source'}:`, result.reason);
      }
    });

    // 去重处理 - 使用标题+年份+视频源的组合作为唯一键，保留不同源的相同内容
    const uniqueVideos = Array.from(
      new Map(allVideos.map(video => [
        `${video.title.toLowerCase()}-${video.year}-${video.source}`,
        video
      ])).values()
    );

    // 随机排序
    const shuffled = uniqueVideos.sort(() => 0.5 - Math.random());

    // 分页处理
    const paginatedVideos = shuffled.slice(pageStart, pageStart + pageLimit);

    return NextResponse.json({
      code: 200,
      message: '获取成功',
      list: paginatedVideos
    });
  } catch (error) {
    console.error('Error in GET /api/source/category:', error);
    return NextResponse.json({
      code: 500,
      message: `获取视频失败: ${(error as Error).message}`,
      list: []
    });
  }
}
