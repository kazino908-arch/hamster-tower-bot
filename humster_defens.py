import telebot
from telebot import types
import json
import os
import random
import time
from threading import Thread

TOKEN = "8736354215:AAGVn35M21amAvPGZOFJy4Akm79G8EF2oxA"
bot = telebot.TeleBot(TOKEN)

# Файл для хранения данных игроков
DATA_FILE = "users_data.json"


# Загрузка/сохранение данных
def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


users_data = load_data()

# Типы хомяков
HAMSTERS = {
    "warrior": {"name": "Воин", "damage": 15, "health": 80, "price": 50},
    "archer": {"name": "Лучник", "damage": 25, "health": 50, "price": 80},
    "mage": {"name": "Маг", "damage": 40, "health": 40, "price": 120},
    "tank": {"name": "Танк", "damage": 10, "health": 150, "price": 100},
}

# Враги
ENEMIES = [
    {"name": "Жук", "health": 60, "damage": 8},
    {"name": "Муравей", "health": 45, "damage": 12},
    {"name": "Паук", "health": 90, "damage": 15},
    {"name": "Богомол", "health": 120, "damage": 20},
]


# =================== КЛАВИАТУРЫ ===================

def main_menu():
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    markup.add("🛣️ Дорога", "🛡️ Защитить")
    markup.add("🛒 Магазин", "🎒 Инвентарь")
    return markup


def defend_menu():
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add("▶️ Играть (Эпизод)")
    markup.add("🔙 Главное меню")
    return markup


# =================== КОМАНДЫ ===================

@bot.message_handler(commands=['start'])
def start(message):
    user_id = str(message.chat.id)
    if user_id not in users_data:
        users_data[user_id] = {
            "gold": 200,
            "hamsters": {"warrior": 2, "archer": 1},  # стартовый набор
            "max_tower_health": 100,
            "episode": 1,
            "wins": 0
        }
        save_data(users_data)

    bot.send_message(
        message.chat.id,
        "🐹 **Хомяки: Башня Обороны**\n\n"
        "Твои хомяки защищают башню от полчищ насекомых!\n"
        "Выбирай действия в меню ниже 👇",
        parse_mode="Markdown",
        reply_markup=main_menu()
    )


# =================== ОБРАБОТКА КНОПОК ===================

@bot.message_handler(func=lambda m: True)
def handle_text(message):
    user_id = str(message.chat.id)
    text = message.text

    if user_id not in users_data:
        bot.send_message(message.chat.id, "Нажми /start для начала")
        return

    data = users_data[user_id]

    if text == "🛣️ Дорога" or text == "🔙 Главное меню":
        bot.send_message(message.chat.id, "Вы на главной дороге. Выберите действие:", reply_markup=main_menu())

    elif text == "🛡️ Защитить":
        bot.send_message(
            message.chat.id,
            f"🛡️ **Защита Башни**\n\n"
            f"Эпизод: {data['episode']}\n"
            f"Здоровье башни: {data['max_tower_health']} ❤️\n"
            f"Побед: {data['wins']}\n\n"
            "Готов защищать башню?",
            reply_markup=defend_menu()
        )

    elif text == "▶️ Играть (Эпизод)":
        start_battle(message, data)

    elif text == "🛒 Магазин":
        shop(message, data)

    elif text == "🎒 Инвентарь":
        inventory(message, data)


# =================== МАГАЗИН ===================

def shop(message, data):
    markup = types.InlineKeyboardMarkup(row_width=1)
    for code, ham in HAMSTERS.items():
        markup.add(types.InlineKeyboardButton(
            f"{ham['name']} — {ham['price']} 🪙",
            callback_data=f"buy_{code}"
        ))
    markup.add(types.InlineKeyboardButton("🔙 Назад", callback_data="back_menu"))

    bot.send_message(
        message.chat.id,
        f"🛒 **Магазин хомяков**\n\n"
        f"Золото: {data['gold']} 🪙\n\n"
        "Кого хочешь нанять?",
        reply_markup=markup
    )


# =================== ИНВЕНТАРЬ ===================

def inventory(message, data):
    text = "🎒 **Твои хомяки:**\n\n"
    for code, count in data.get("hamsters", {}).items():
        if count > 0:
            ham = HAMSTERS[code]
            text += f"• {ham['name']}: {count} шт.\n"

    if not text.strip():
        text = "У тебя пока нет хомяков!"

    bot.send_message(message.chat.id, text)


# =================== БИТВА ===================

def start_battle(message, data):
    episode = data["episode"]
    bot.send_message(message.chat.id, f"⚔️ **Эпизод {episode} начался!**\nХомяки на позиции! Битва начинается...")

    # Простая симуляция битвы
    tower_hp = data["max_tower_health"]
    hamsters = data.get("hamsters", {})

    total_damage = 0
    for code, count in hamsters.items():
        if count > 0:
            total_damage += HAMSTERS[code]["damage"] * count * 1.5  # бонус за количество

    enemy_count = 5 + episode * 2
    enemy_hp_total = sum(random.randint(40, 130) for _ in range(enemy_count))

    # Симуляция
    for i in range(1, 6):
        bot.send_message(message.chat.id, f"Волна {i}/5...")
        time.sleep(1.5)

    if total_damage >= enemy_hp_total * 0.7:  # победа
        reward = 80 + episode * 30
        data["gold"] += reward
        data["wins"] += 1
        data["episode"] += 1

        bot.send_message(
            message.chat.id,
            f"🎉 **ПОБЕДА!**\n\n"
            f"Награда: +{reward} 🪙\n"
            f"Теперь эпизод: {data['episode']}",
            reply_markup=main_menu()
        )
    else:
        damage_to_tower = max(10, enemy_hp_total - total_damage)
        tower_hp = max(0, tower_hp - damage_to_tower)
        data["max_tower_health"] = tower_hp

        bot.send_message(
            message.chat.id,
            f"💥 **Поражение...**\n\n"
            f"Башня получила урон: {damage_to_tower}\n"
            f"Здоровье башни: {tower_hp} ❤️",
            reply_markup=main_menu()
        )

    save_data(users_data)


# =================== CALLBACK (покупки) ===================

@bot.callback_query_handler(func=lambda call: True)
def callback_handler(call):
    user_id = str(call.message.chat.id)
    data = users_data[user_id]

    if call.data.startswith("buy_"):
        code = call.data[4:]
        ham = HAMSTERS[code]

        if data["gold"] >= ham["price"]:
            data["gold"] -= ham["price"]
            if code not in data["hamsters"]:
                data["hamsters"][code] = 0
            data["hamsters"][code] += 1

            save_data(users_data)
            bot.answer_callback_query(call.id, f"Куплен {ham['name']}!")
            bot.edit_message_text(
                f"✅ Куплен **{ham['name']}**!\nЗолото осталось: {data['gold']}",
                call.message.chat.id,
                call.message.message_id
            )
        else:
            bot.answer_callback_query(call.id, "Недостаточно золота!", show_alert=True)

    elif call.data == "back_menu":
        bot.edit_message_text("Возвращаемся...", call.message.chat.id, call.message.message_id)


# =================== ЗАПУСК ===================

if __name__ == "__main__":
    print("Бот Хомяки Tower Defense запущен!")
    bot.infinity_polling()