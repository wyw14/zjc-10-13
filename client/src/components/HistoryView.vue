<template>
  <div class="card">
    <div v-if="history && history.stats" class="stats-panel">
      <div class="stat-card green">
        <div class="stat-num">{{ history.stats.answeredCount }}</div>
        <div class="stat-label">✓ 已回答天数</div>
      </div>
      <div class="stat-card red">
        <div class="stat-num">{{ history.stats.missedCount }}</div>
        <div class="stat-label">✗ 断更天数</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-num">
          {{ history.stats.totalDays > 0 ? Math.round(history.stats.answeredCount / history.stats.totalDays * 100) : 0 }}%
        </div>
        <div class="stat-label">📊 坚持率</div>
      </div>
    </div>

    <div class="calendar-header">
      <button class="nav-btn" @click="$emit('prev-month')">← 上月</button>
      <div class="calendar-title">
        {{ history?.year }}年 {{ history?.month }}月
      </div>
      <button class="nav-btn" @click="$emit('next-month')">下月 →</button>
    </div>

    <div class="calendar-grid">
      <div v-for="w in weekdays" :key="w" class="calendar-weekday">{{ w }}</div>
      <div
        v-for="(day, idx) in fullCalendar"
        :key="idx"
        class="calendar-day"
        :class="getDayClass(day)"
        @click="selectDay(day)"
      >
        <span v-if="day" class="day-num">{{ day.day }}</span>
      </div>
    </div>

    <div class="legend">
      <div class="legend-item">
        <div class="legend-box answered"></div>
        <span>已回答</span>
      </div>
      <div class="legend-item">
        <div class="legend-box missed"></div>
        <span>断更（应回答未答）</span>
      </div>
      <div class="legend-item">
        <div class="legend-box today"></div>
        <span>今天</span>
      </div>
      <div class="legend-item">
        <div class="legend-box empty-day"></div>
        <span>无记录</span>
      </div>
    </div>

    <div v-if="selectedDay" class="day-detail">
      <h4>📌 {{ formatFullDate(selectedDay.date) }}</h4>
      <div v-if="selectedDay.hasQuestion">
        <p class="q-text">❓ {{ selectedDay.question }}</p>
        <div v-if="selectedDay.answered && selectedDay.answer">
          <div class="answer-header">
            <p class="a-text">{{ selectedDay.answer }}</p>
            <button v-if="!showVersions" class="versions-btn" @click="loadVersions">
              📜 查看历史版本 ({{ versions.length > 0 ? versions.length : '?' }})
            </button>
            <button v-else class="versions-btn close" @click="showVersions = false">
              ✕ 关闭版本列表
            </button>
          </div>

          <div v-if="showVersions" class="versions-panel">
            <h5>📚 历史版本</h5>
            <div v-if="versionsLoading" class="empty-note">加载版本中...</div>
            <div v-else-if="versions.length === 0" class="empty-note">暂无历史版本</div>
            <div v-else class="versions-list">
              <div
                v-for="v in versions"
                :key="v.version"
                class="version-item"
                :class="{ current: v.version === currentVersion, restoring: restoringVersion === v.version }"
              >
                <div class="version-header">
                  <span class="version-num">
                    版本 {{ v.version }}
                    <span v-if="v.version === currentVersion" class="current-badge">当前</span>
                    <span v-if="v.restoredFrom" class="restored-badge">
                      恢复自版本 {{ v.restoredFrom }}
                    </span>
                  </span>
                  <span class="version-time">{{ formatTime(v.savedAt) }}</span>
                </div>
                <div class="version-answer">{{ v.answer }}</div>
                <div class="version-actions">
                  <button
                    v-if="v.version !== currentVersion"
                    class="restore-btn"
                    :disabled="restoringVersion === v.version"
                    @click="restoreVersion(v.version)"
                  >
                    {{ restoringVersion === v.version ? '恢复中...' : '↩ 恢复此版本' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-note">这一天没有回答</div>
      </div>
      <div v-else class="empty-note">这一天还没有分配问题</div>
    </div>

    <div v-if="loading" class="empty-note">加载中...</div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  history: Object,
  loading: Boolean
})

const emit = defineEmits(['prev-month', 'next-month', 'version-restored'])

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const selectedDay = ref(null)
const showVersions = ref(false)
const versions = ref([])
const versionsLoading = ref(false)
const currentVersion = ref(0)
const restoringVersion = ref(null)

const fullCalendar = computed(() => {
  if (!props.history?.calendar) return []
  const cal = [...props.history.calendar]
  const firstDay = cal[0]
  if (!firstDay) return cal
  const d = new Date(firstDay.date)
  const firstWeekday = d.getDay()
  for (let i = 0; i < firstWeekday; i++) {
    cal.unshift(null)
  }
  return cal
})

function getTodayStr() {
  const t = new Date()
  const y = t.getFullYear()
  const m = String(t.getMonth() + 1).padStart(2, '0')
  const d = String(t.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isPast(dateStr) {
  return dateStr < getTodayStr()
}

function getDayClass(day) {
  if (!day) return 'empty'
  const classes = []
  const todayStr = getTodayStr()
  if (day.date === todayStr) {
    classes.push('today')
  }
  if (day.answered) {
    classes.push('answered')
  } else if (day.hasQuestion && isPast(day.date)) {
    classes.push('missed')
  } else if (day.hasQuestion) {
    classes.push('has-question')
  }
  return classes.join(' ')
}

function selectDay(day) {
  if (day && day.hasQuestion) {
    selectedDay.value = day
    showVersions.value = false
    versions.value = []
    currentVersion.value = 0
  } else {
    selectedDay.value = null
  }
}

function formatFullDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`
}

function formatTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

async function loadVersions() {
  if (!selectedDay.value) return
  versionsLoading.value = true
  try {
    const res = await fetch(`/api/answer/${selectedDay.value.date}/versions`)
    const json = await res.json()
    if (json.success) {
      versions.value = json.data.versions
      currentVersion.value = json.data.currentVersion
      showVersions.value = true
    }
  } catch (e) {
    console.error('加载版本失败', e)
  } finally {
    versionsLoading.value = false
  }
}

async function restoreVersion(versionNum) {
  if (!selectedDay.value) return
  restoringVersion.value = versionNum
  try {
    const res = await fetch(`/api/answer/${selectedDay.value.date}/versions/${versionNum}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const json = await res.json()
    if (json.success) {
      selectedDay.value.answer = json.data.answer
      currentVersion.value = json.data.currentVersion
      await loadVersions()
      emit('version-restored', { date: selectedDay.value.date, version: versionNum })
    }
  } catch (e) {
    console.error('恢复版本失败', e)
  } finally {
    restoringVersion.value = null
  }
}

watch(() => props.history, () => {
  selectedDay.value = null
  showVersions.value = false
  versions.value = []
  currentVersion.value = 0
})
</script>
