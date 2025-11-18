/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { API_CONFIG, getAvailableApiSites } from '@/lib/config';
import { cleanHtmlTags } from '@/lib/utils';

interface ApiSearchItem {
  vod_id?: string | number;
  vod_name?: string;
  vod_pic?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  type_name?: string;
}

interface VideoResult {
  id: string;
  title: string;
  poster: string;
  episodes: string[];
  source: string;
  source_name: string;
  class: string;
  year: string;
  desc: string;
  type_name: string;
}

// 带超时控制的fetch请求函数
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;

  // 设置8秒超时，与系统中其他API调用保持一致
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

// 从单个API源获取热门视频数据
async function fetchHotVideosFromApi(apiUrl: string, sourceKey: string, sourceName: string): Promise<VideoResult[]> {
  try {
    // 关键点：使用系统配置的正确API格式，但搜索热门内容关键词
    // 使用一些通用关键词来获取热门内容，模拟热门列表
    const hotKeywords = ['热门', '最新', '推荐'];
    const randomKeyword = hotKeywords[Math.floor(Math.random() * hotKeywords.length)];
    const searchUrl = `${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(randomKeyword)}`;

    const response = await fetchWithTimeout(searchUrl, {
      headers: API_CONFIG.search.headers
    });

    if (!response.ok) {
      console.warn(`Failed to fetch hot videos from ${sourceName}: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();

    // 确保数据包含视频列表
    if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
      return [];
    }

    // 匹配系统中SearchResult的数据结构
    return data.list.map((item: ApiSearchItem) => {
      // 处理播放链接，与系统中其他部分保持一致
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
    }).filter((video: VideoResult) => video.title && video.poster); // 过滤无效数据
  } catch (error) {
    console.warn(`Error fetching hot videos from ${sourceName}:`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const pageLimit = parseInt(searchParams.get('limit') || '20');
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

    // 并行从所有视频源获取热门视频，但限制并行数量以避免过多请求
    const promises = apiSites.slice(0, 3).map(site =>
      fetchHotVideosFromApi(site.api, site.key, site.name)
    );
    const results = await Promise.allSettled(promises);

    // 收集所有成功的结果
    const allVideos: VideoResult[] = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allVideos.push(...result.value);
      }
    });

    // 更好的去重逻辑，基于标题和年份/类型的组合
    const uniqueVideos = Array.from(
      new Map(allVideos.map(video => [
        `${video.title.toLowerCase()}-${video.year}-${video.class}`,
        video
      ])).values()
    );

    // 随机排序以混合不同来源的视频
    const shuffled = uniqueVideos.sort(() => 0.5 - Math.random());

    // 根据分页参数返回结果
    const paginatedVideos = shuffled.slice(pageStart, pageStart + pageLimit);

    return NextResponse.json({
      code: 200,
      message: '获取成功',
      list: paginatedVideos
    });
  } catch (error) {
    console.error('Error in GET /api/source/hot:', error);
    return NextResponse.json({
      code: 500,
      message: `获取热门视频失败: ${(error as Error).message}`,
      list: []
    });
  }
}
